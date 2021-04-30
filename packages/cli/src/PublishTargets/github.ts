import {changesToMarkdown} from '@rollingversions/change-set';
import {printTag} from '@rollingversions/tag-format';

import {getHeadSha} from '../services/git';
import type {GitHubClient} from '../services/github';
import {
  getRepositoryViewerPermissions,
  getBranch,
  getViewer,
} from '../services/github';
import type {PrePublishResult, PublishConfig} from '../types';
import type {NewVersionToBePublished} from '../utils/getPackageStatuses';

export async function checkGitHubReleaseStatus(
  {
    owner,
    name,
    dirname,
    deployBranch,
    allowNonLatestCommit,
  }: Pick<
    PublishConfig,
    'owner' | 'name' | 'dirname' | 'deployBranch' | 'allowNonLatestCommit'
  >,
  branch: {headSha: string; name: string},
  client: GitHubClient,
): Promise<{ok: true} | {ok: false; reason: string}> {
  const [viewer, permission] = await Promise.all([
    getViewer(client),
    getRepositoryViewerPermissions(client, {
      owner,
      name,
    }),
    getBranch(client, {owner, name}, deployBranch),
  ]);
  if (
    viewer.login !== 'github-actions[bot]' &&
    (!permission || !['ADMIN', 'MAINTAIN', 'WRITE'].includes(permission))
  ) {
    return {
      ok: false,
      reason: `This GitHub token does not have permission to publish tags/releases to GitHub. It has viewerPermission ${permission} but needs one of ADMIN, MAINTAIN or WRITE`,
    };
  }
  if (!branch) {
    return {
      ok: false,
      reason: deployBranch
        ? `Could not find the branch "${deployBranch}" in the repository "${owner}/${name}".`
        : `Could not find the default branch in the repository "${owner}/${name}".`,
    };
  }
  if (!branch.headSha) {
    return {
      ok: false,
      reason: `Could not find a commit for the "${branch.name}" in the repository "${owner}/${name}".`,
    };
  }
  if (!allowNonLatestCommit) {
    const headSha = await getHeadSha(dirname);
    if (headSha !== branch.headSha) {
      return {
        ok: false,
        reason: `This build is not running against the latest commit in ${branch.name}. To avoid awkward race conditions we'll skip publishing here and leave publishing to the other commit. If this looks like the wrong branch name, you can pass a different branch name via the "--deploy-branch" CLI parameter. You can supress this warning and publish anyway by passing the "--allow-non-latest-commit" flag when calling the Rolling Versions CLI.`,
      };
    }
  }

  return {ok: true};
}

export function checkGitHubTagAvailable(
  {canary}: PublishConfig,
  pkg: NewVersionToBePublished,
  allTagNames: Set<string>,
): PrePublishResult {
  if (canary === null) {
    const tagName = printTag(pkg.newVersion, {
      packageName: pkg.packageName,
      oldTagName: pkg.currentTagName,
      tagFormat: pkg.manifest.tagFormat,
    });
    if (allTagNames.has(tagName)) {
      return {ok: false, reason: `The tag name ${tagName} already exists.`};
    }
  }
  return {ok: true};
}

export async function createGitHubRelease(
  {owner, name: repo, dirname, dryRun, canary, logger}: PublishConfig,
  client: GitHubClient,
  pkg: NewVersionToBePublished,
) {
  const headSha = await getHeadSha(dirname);
  if (canary) {
    logger.onCanaryGitHubRelease?.({pkg, dryRun});
  } else {
    const tagName = printTag(pkg.newVersion, {
      packageName: pkg.packageName,
      oldTagName: pkg.currentTagName,
      tagFormat: pkg.manifest.tagFormat,
    });
    logger.onPublishGitHubRelease?.({pkg, tagName, dryRun});
    let response;
    if (!dryRun) {
      response = (
        await client.rest.repos.createRelease({
          draft: false,
          prerelease: false,
          owner,
          repo,

          body: changesToMarkdown(pkg.changeSet, {
            headingLevel: 2,
            renderContext: ({pr}) => ` (#${pr})`,
          }),
          name: tagName,
          tag_name: tagName,
          target_commitish: headSha,
        })
      ).data;
    }
    logger.onPublishedGitHubRelease?.({pkg, tagName, dryRun, response});
  }
}
