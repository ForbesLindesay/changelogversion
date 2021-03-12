import type {Repository} from 'rollingversions/lib/types';

import type {Logger} from '../../logger';
import type {GitHubClient, GitHubCommit} from '../../services/github';
import type {Queryable} from '../../services/postgres';
import {
  upsertCommits as upsertCommitsPg,
  filterOutExisingPullRequestIDs,
  filterToExistingCommitShas,
  addAssociatedPullRequests,
} from '../../services/postgres';
import upsertPullRequest from './upsertPullRequest';

export default async function upsertCommits(
  db: Queryable,
  client: GitHubClient,
  repositoryId: number,
  repo: Repository,
  allCommits: AsyncGenerator<GitHubCommit[], void, unknown>,
  {forceFullScan}: {forceFullScan: boolean},
  logger: Logger,
) {
  function isMatchingRepositoryID(commit: {
    repositoryId: number | null;
  }): boolean {
    return commit.repositoryId === repositoryId;
  }
  const seenPullRequests = new Set<number>();
  const missingParents = new Set<string>();
  const newCommits = [];
  let headCommit;
  for await (const commits of allCommits) {
    if (!headCommit) {
      headCommit = commits[0];
    }
    const existingShas = await filterToExistingCommitShas(db, repositoryId, [
      ...commits.map((c) => c.commit_sha),
      ...commits.flatMap((c) => c.parents),
    ]);
    for (const commit of commits) {
      if (!existingShas.has(commit.commit_sha)) {
        newCommits.push(commit);
        missingParents.delete(commit.commit_sha);
        for (const parent of commit.parents) {
          if (!existingShas.has(parent)) {
            missingParents.add(parent);
          }
        }
      }
      if (missingParents.size === 0) {
        break;
      }
    }
    const exisingCommits = commits.filter((c) =>
      existingShas.has(c.commit_sha),
    );
    let lastAssociatedPRInserted = 0;
    if (exisingCommits.length) {
      await addMissingPullRequests(
        db,
        client,
        repositoryId,
        repo,
        exisingCommits.flatMap((c) =>
          c.associatedPullRequests.filter(isMatchingRepositoryID),
        ),
        seenPullRequests,
        logger,
      );
      lastAssociatedPRInserted = await addAssociatedPullRequests(
        db,
        repositoryId,
        exisingCommits.flatMap((c) =>
          c.associatedPullRequests.filter(isMatchingRepositoryID).map((pr) => ({
            commit_sha: c.commit_sha,
            pull_request_id: pr.id,
          })),
        ),
      );
    }
    if (
      missingParents.size === 0 &&
      lastAssociatedPRInserted === 0 &&
      !forceFullScan
    ) {
      break;
    }
  }
  if (newCommits.length === 0) {
    return headCommit;
  }

  newCommits.reverse();
  await addMissingPullRequests(
    db,
    client,
    repositoryId,
    repo,
    newCommits.flatMap((c) =>
      c.associatedPullRequests.filter(isMatchingRepositoryID),
    ),
    seenPullRequests,
    logger,
  );

  await upsertCommitsPg(db, repositoryId, newCommits);

  return headCommit;
}

async function addMissingPullRequests(
  db: Queryable,
  client: GitHubClient,
  repositoryId: number,
  repo: Repository,
  pullRequests: {
    id: number;
    graphql_id: string;
  }[],
  seenPullRequests: Set<number>,
  logger: Logger,
) {
  const newPullRequests = await filterOutExisingPullRequestIDs(
    db,
    repositoryId,
    pullRequests.filter(({id}) => {
      if (seenPullRequests.has(id)) {
        return false;
      } else {
        seenPullRequests.add(id);
        return true;
      }
    }),
  );

  await Promise.all(
    newPullRequests.map(async (p) => {
      await upsertPullRequest(
        db,
        client,
        repositoryId,
        repo,
        p.graphql_id,
        logger,
      );
    }),
  );
}
