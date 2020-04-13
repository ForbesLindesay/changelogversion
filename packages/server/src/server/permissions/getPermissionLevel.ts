import {PullRequest} from 'rollingversions/lib/types';
import Permission from './Permission';
import {getClientForToken} from '../getClient';

// TODO: this should use GraphQL rather than the REST API

export {Permission};
export default async function getPermissionLevel(
  pr: Pick<PullRequest, 'repo' | 'number'>,
  userAuth: string,
): Promise<Permission> {
  const client = getClientForToken(userAuth);

  const authenticated = await client.rest.users.getAuthenticated();
  let pull;
  try {
    pull = await client.rest.pulls.get({
      owner: pr.repo.owner,
      repo: pr.repo.name,
      pull_number: pr.number,
    });
  } catch (ex) {
    return 'none';
  }
  if (pull.data.merged) {
    // TODO: allow the repo owner to edit changelogs for packages
    //       that have not been released
    return 'view';
  }
  if (pull.data.user.login === authenticated.data.login) {
    return 'edit';
  }
  const permission = await client.rest.repos.getCollaboratorPermissionLevel({
    owner: pr.repo.owner,
    repo: pr.repo.name,
    username: authenticated.data.login,
  });
  if (
    permission.data.permission === 'admin' ||
    permission.data.permission === 'write'
  ) {
    return 'edit';
  }
  return 'view';
}
