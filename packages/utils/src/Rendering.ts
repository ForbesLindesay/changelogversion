import {URL} from 'url';
import PullChangeLog, {
  ChangeLogEntry,
  ChangeTypes,
  SectionTitle,
} from './PullChangeLog';
import {writeState} from './CommentState';
import {getNewVersion, getCurrentVerion} from './Versioning';
import {PackageInfo, PackageInfos} from './Platforms';

export const COMMENT_GUID = `9d24171b-1f63-43f0-9019-c4202b3e8e22`;
const COMMENT_PREFIX = `<!-- This comment is maintained by Changelog Version. Do not edit it manually! -->\n<!-- ${COMMENT_GUID} -->\n\n`;

export function changesToMarkdown(
  changes: readonly (ChangeLogEntry & {readonly pr?: number})[],
  headingLevel: number,
) {
  const headingPrefix = '#'.repeat(headingLevel);
  return ChangeTypes.filter((ct) => changes.some((c) => c.type === ct))
    .map(
      (ct) =>
        `${headingPrefix} ${SectionTitle[ct]}\n\n${changes
          .filter((c) => c.type === ct)
          .map(
            (c) =>
              `- ${c.title}${c.pr ? ` (#${c.pr})` : ``}${
                c.body ? `\n\n${c.body.replace(/^/gm, '  ')}` : ``
              }`,
          )
          .join('\n\n')}`,
    )
    .join('\n\n');
}

export interface PullRequst {
  headSha: string;
  owner: string;
  repo: string;
  number: number;
  currentVersions: PackageInfos;
}

export function getVersionShift(
  currentVersion: PackageInfo[],
  changes: readonly Pick<ChangeLogEntry, 'type'>[],
) {
  // if we want to support not knowing the previous version:
  // if (currentVersion === undefined) {
  //   const bump = getVersionBump(changes);
  //   switch (bump) {
  //     case 'major':
  //       return '(↑.-.-)';
  //     case 'minor':
  //       return '(-.↑.-)';
  //     case 'patch':
  //       return '(-.-.↑)';
  //     default:
  //       return 'no new release';
  //   }
  // }
  return `(${getCurrentVerion(currentVersion) ||
    'unreleased'} → ${getNewVersion(currentVersion, changes) ||
    'no new release'})`;
}
export function getUrlForChangeLog(
  pullRequest: PullRequst,
  changeLogVersionURL: URL,
) {
  const url = new URL(
    `/${pullRequest.owner}/${pullRequest.repo}/pulls/${pullRequest.number}`,
    changeLogVersionURL,
  );
  return url;
}

export function getShortDescription(
  pullRequest: Pick<PullRequst, 'headSha'>,
  changeLog: PullChangeLog | undefined,
) {
  if (changeLog && changeLog.submittedAtCommitSha === pullRequest.headSha) {
    const packagesToRelease = changeLog.packages.filter(
      (p) => p.changes.length > 0,
    );
    if (packagesToRelease.length === 0) {
      return 'no changes to release';
    }
    if (packagesToRelease.length === 1) {
      return `releasing ${packagesToRelease[0].packageName}`;
    }
    return 'releasing multiple packages';
  }
  return changeLog && changeLog.submittedAtCommitSha
    ? 'please update the changelog'
    : 'please add a changelog';
}
export function renderCommentWithoutState(
  pullRequest: PullRequst,
  changeLog: PullChangeLog | undefined,
  changeLogVersionURL: URL,
) {
  const url = getUrlForChangeLog(pullRequest, changeLogVersionURL);
  if (!changeLog || !changeLog.submittedAtCommitSha) {
    return `There is no change log for this pull request yet.\n\n[Create a changelog](${url.href})`;
  }
  const outdated =
    pullRequest.headSha === changeLog.submittedAtCommitSha
      ? ``
      : `\n\n> **Change log has not been updated since latest commit** [Update Changelog](${url.href})`;

  const packages = Object.keys(pullRequest.currentVersions).sort();
  if (packages.length === 1) {
    const pkg = changeLog.packages.find((p) => p.packageName === packages[0]);
    if (!pkg || pkg.changes.length === 0) {
      return `This PR will not result in a new version of ${packages[0]} as there are no user facing changes.\n\n[Add changes to trigger a release](${url.href})${outdated}`;
    }
    return `## Change Log for ${pkg.packageName} ${getVersionShift(
      pullRequest.currentVersions[pkg.packageName] || [],
      pkg.changes,
    )}\n\n${changesToMarkdown(pkg.changes, 3)}\n\n[Edit changelog](${
      url.href
    })${outdated}`;
  }
  if (!changeLog.packages.some((pkg) => pkg.changes.length)) {
    return `This PR will not result in a new version of the following packages as there are no user facing changes:\n\n${packages
      .map((pkg) => `- ${pkg}`)
      .join('\n')}\n\n[Add changes to trigger a release](${
      url.href
    })${outdated}`;
  }

  const packagesWithoutChanges = packages.filter((packageName) => {
    const pkg = changeLog.packages.find((p) => p.packageName === packageName);
    return !pkg || !pkg.changes.length;
  });
  return `## Change Logs\n\n${changeLog.packages
    .filter((pkg) => pkg.changes.length)
    .map(
      (pkg) =>
        `### ${pkg.packageName} ${getVersionShift(
          pullRequest.currentVersions[pkg.packageName] || [],
          pkg.changes,
        )}\n\n${changesToMarkdown(pkg.changes, 4)}`,
    )
    .join('\n\n')}${
    packagesWithoutChanges.length
      ? `\n\n## Packages With No Changes\n\nThe following packages have no user facing changes, so won't be released:\n\n${packagesWithoutChanges
          .map((pkg) => `- ${pkg}`)
          .join('\n')}`
      : ``
  }\n\n[Edit changelogs](${url.href})${outdated}`;
}

export function renderComment(
  pullRequest: PullRequst,
  changeLog: PullChangeLog | undefined,
  changeLogVersionURL: URL,
) {
  return writeState(
    `${COMMENT_PREFIX}${renderCommentWithoutState(
      pullRequest,
      changeLog,
      changeLogVersionURL,
    )}`,
    changeLog,
  );
}

export function renderReleaseNotes(
  changes: readonly (ChangeLogEntry & {readonly pr?: number})[],
) {
  return changesToMarkdown(changes, 3);
}
