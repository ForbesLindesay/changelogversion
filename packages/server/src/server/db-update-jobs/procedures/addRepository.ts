import {Repository} from 'rollingversions/lib/types';
import {
  Connection,
  upsertRepository,
  getCommitIdFromSha,
  getBranch,
  writeBranch,
  filterOutExisingPullRequestIDs,
} from '../../services/postgres';
import {
  GitHubClient,
  getRepository,
  getDefaultBranch,
  getAllDefaultBranchCommits,
  getRepositoryPullRequestIDs,
} from '../../services/github';
import upsertCommits from './upsertCommits';
import upsertPullRequest from './upsertPullRequest';
import log from '../../logger';
import getAllTags from './getAllTags';

export default async function addRepository(
  db: Connection,
  client: GitHubClient,
  repo: Repository,
  {refreshPRs, refreshTags}: {refreshPRs: boolean; refreshTags: boolean},
) {
  const [repository, defaultBranch] = await Promise.all([
    getRepository(client, repo),
    getDefaultBranch(client, repo),
  ]);

  if (!repository) {
    throw new Error(`Could not read the repository ${repo.owner}/${repo.name}`);
  }
  if (!defaultBranch) {
    throw new Error(
      `Could not read the default branch for ${repo.owner}/${repo.name}`,
    );
  }

  await upsertRepository(db, {
    ...repository,
    default_branch_name: defaultBranch.name,
  });
  const dbBranch = await getBranch(db, repository.id, defaultBranch.name);

  if (refreshPRs) {
    const startReadingPullRequests = Date.now();
    // TODO(perf): avoid reading all IDs once the initial first pass is complete
    for await (const pullRequestIDs of getRepositoryPullRequestIDs(
      client,
      repo,
    )) {
      const newPullRequests = await filterOutExisingPullRequestIDs(
        db,
        repository.id,
        pullRequestIDs,
      );
      await Promise.all(
        newPullRequests.map(({graphql_id}) =>
          upsertPullRequest(
            db,
            client,
            repository.id,
            {
              owner: repository.owner,
              name: repository.name,
            },
            graphql_id,
          ),
        ),
      );
    }
    log({
      event_type: 'read_pull_requests',
      message: 'Read all pull request IDs',
      event_status: 'ok',
      duration: Date.now() - startReadingPullRequests,
    });
  }

  let commitID = await getCommitIdFromSha(
    db,
    repository.id,
    defaultBranch.target.commit_sha,
  );
  if (!commitID) {
    await upsertCommits(
      db,
      client,
      repository.id,
      {owner: repository.owner, name: repository.name},
      getAllDefaultBranchCommits(client, repo),
    );

    commitID = await getCommitIdFromSha(
      db,
      repository.id,
      defaultBranch.target.commit_sha,
    );
    if (!commitID) {
      throw new Error('Missing commitID for head of branch');
    }
  }

  await writeBranch(
    db,
    repository.id,
    {
      graphql_id: defaultBranch.graphql_id,
      name: defaultBranch.name,
      target_git_commit_id: commitID,
    },
    dbBranch?.target_git_commit_id || null,
  );

  const tags = await getAllTags(db, client, repository, {
    loadFromGitHub: refreshTags,
  });

  return {
    ...repository,
    tags,
    head: {id: commitID, ...defaultBranch.target},
  };
}
