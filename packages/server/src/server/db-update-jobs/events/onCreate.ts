import WebhooksApi from '@octokit/webhooks';
import {
  db,
  writeBranch,
  getBranch,
  upsertTag,
  getCommitFromSha,
} from '../../services/postgres';
import {
  getAllRefCommits,
  getRef,
  getCommitHistory,
} from '../../services/github';
import {getClientForEvent} from '../../getClient';
import upsertCommits from '../procedures/upsertCommits';
import getPackageManifests from '../procedures/getPackageManifests';

export default async function onCreate(
  e: WebhooksApi.WebhookEvent<WebhooksApi.WebhookPayloadCreate>,
) {
  const client = getClientForEvent(e);

  const gitRepositoryId = e.payload.repository.id;
  const repo = {
    owner: e.payload.repository.owner.login,
    name: e.payload.repository.name,
  };

  switch (e.payload.ref_type) {
    case 'branch': {
      const ref = {type: 'head' as const, name: e.payload.ref};
      const dbBranch = await getBranch(db, gitRepositoryId, ref.name);

      await upsertCommits(
        db,
        client,
        gitRepositoryId,
        repo,
        getAllRefCommits(client, repo, ref),
      );

      const gitRef = await getRef(client, repo, ref);
      if (!gitRef) {
        throw new Error(`Could not find the git ref`);
      }
      const headCommit = await getCommitFromSha(
        db,
        gitRepositoryId,
        gitRef.target,
      );
      if (!headCommit) {
        throw new Error(
          `Cannot find id for head commit ${gitRef.target} on branch ${gitRef.name}`,
        );
      }
      await writeBranch(
        db,
        gitRepositoryId,
        {
          graphql_id: gitRef.graphql_id,
          name: gitRef.name,
          target_git_commit_id: headCommit.id,
        },
        dbBranch?.target_git_commit_id || null,
      );
      await getPackageManifests(db, client, repo, headCommit);
      break;
    }
    case 'tag': {
      const ref = {type: 'tag' as const, name: e.payload.ref};
      const gitRef = await getRef(client, repo, ref);

      if (!gitRef) {
        throw new Error(`Could not find the git ref`);
      }

      await upsertCommits(
        db,
        client,
        gitRepositoryId,
        repo,
        getCommitHistory(client, gitRef.targetGraphID),
      );
      const headCommit = await getCommitFromSha(
        db,
        gitRepositoryId,
        gitRef.target,
      );
      if (!headCommit) {
        throw new Error(
          `Cannot find id for head commit ${gitRef.target} on tag ${gitRef.name}`,
        );
      }
      await upsertTag(db, gitRepositoryId, {
        graphql_id: gitRef.graphql_id,
        name: gitRef.name,
        target_git_commit_id: headCommit.id,
      });
      break;
    }
    default:
      throw new Error(
        `Invalid ref type "${e.payload.ref_type}" for "${e.payload.ref}", expected "branch" or "tag"`,
      );
  }
}
