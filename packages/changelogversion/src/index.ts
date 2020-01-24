import {resolve, dirname} from 'path';
import {readFileSync, writeFileSync} from 'fs';
import DataLoader from 'dataloader';
import {graphql} from '@octokit/graphql';
import Octokit from '@octokit/rest';
import chalk from 'chalk';
import {getAllTags} from 'changelogversion-utils/lib/GitHub';
import {
  listPackages,
  getCommits,
  getChangeLogs,
  getHeadSha,
} from 'changelogversion-utils/lib/LocalRepo';
import {
  getCurrentVerion,
  getNewVersion,
} from 'changelogversion-utils/lib/Versioning';
import {
  getProfile,
  getPackument,
  getOrgRoster,
} from 'changelogversion-utils/lib/Npm';
import {ChangeLogEntry} from 'changelogversion-utils/lib/PullChangeLog';
import {PackageInfo, Platform} from 'changelogversion-utils/lib/Platforms';
import isTruthy from 'changelogversion-utils/lib/utils/isTruthy';
import {changesToMarkdown} from 'changelogversion-utils/lib/Rendering';
import {spawnBuffered} from 'changelogversion-utils/lib/spawn';

const stringifyPackage = require('stringify-package');
const detectIndent = require('detect-indent');
const detectNewline = require('detect-newline').graceful;

export enum Status {
  MissingTag,
  NoUpdateRequired,
  NewVersionToBePublished,
}
export interface MissingTag {
  status: Status.MissingTag;
  packageName: string;
  currentVersion: string;
  pkgInfos: readonly PackageInfo[];
}
export interface NoUpdateRequired {
  status: Status.NoUpdateRequired;
  packageName: string;
  currentVersion: string | null;
  pkgInfos: readonly PackageInfo[];
}
export interface NewVersionToBePublished {
  status: Status.NewVersionToBePublished;
  packageName: string;
  currentVersion: string | null;
  newVersion: string;
  changeLogEntries: readonly (ChangeLogEntry & {pr: number})[];
  pkgInfos: readonly PackageInfo[];
}

export type PackageStatus =
  | MissingTag
  | NoUpdateRequired
  | NewVersionToBePublished;

export interface Config {
  dirname: string;
  owner: string;
  name: string;
  accessToken: string;
  deployBranch: string | null;
}

function isSinglePackageWithDirectVersion(packages: readonly PackageStatus[]) {
  return (
    packages.length === 1 &&
    packages[0].pkgInfos.some((p) => p.versionTag) &&
    packages[0].pkgInfos.every(
      (p) => !p.versionTag || !p.versionTag.name.includes?.('@'),
    )
  );
}
function gitTagsHavePrefix(pkg: PackageStatus) {
  return (
    pkg.pkgInfos.some((p) => p.versionTag) &&
    pkg.pkgInfos.every(
      (p) =>
        !p.versionTag || p.versionTag.name.replace(/^.*\@/, '').startsWith('v'),
    )
  );
}
export function getGitTag(
  packages: readonly PackageStatus[],
  pkg: NewVersionToBePublished,
) {
  const start = isSinglePackageWithDirectVersion(packages)
    ? ``
    : `${pkg.packageName}@`;
  const end = gitTagsHavePrefix(pkg) ? `v${pkg.newVersion}` : pkg.newVersion;
  return `${start}${end}`;
}

export async function getPackagesStatus({
  dirname,
  owner,
  name,
  accessToken,
}: Config) {
  const commitsLoader = new DataLoader(async (since: readonly string[]) => {
    return await Promise.all(
      since.map((t) => getCommits(dirname, t || undefined)),
    );
  });
  const changeLogsLoader = new DataLoader(
    async (commits: readonly string[]) => {
      return await getChangeLogs(
        graphql.defaults({
          headers: {
            authorization: `token ${accessToken}`,
          },
        }),
        owner,
        name,
        commits,
      );
    },
  );

  const packages = (
    await Promise.all(
      Object.entries(await listPackages(dirname)).map(
        async ([packageName, pkgInfos]): Promise<PackageStatus | null> => {
          if (!pkgInfos) return null;
          const currentVersion = getCurrentVerion(pkgInfos);
          const currentTag = currentVersion
            ? pkgInfos.find(
                (info) => info.versionTag?.version === currentVersion,
              )?.versionTag
            : null;
          if (currentVersion && !currentTag) {
            return {
              status: Status.MissingTag,
              packageName,
              currentVersion,
              pkgInfos,
            };
          }
          const commits = await commitsLoader.load(
            currentTag ? currentTag.commitSha : '',
          );
          const changeLogs = await changeLogsLoader.loadMany(commits);
          const handledPRs = new Set<number>();
          const changeLogEntries: (ChangeLogEntry & {pr: number})[] = [];
          for (const cl of changeLogs) {
            if (cl instanceof Error) {
              throw cl;
            }
            for (const pullChangeLog of cl) {
              if (handledPRs.has(pullChangeLog.pr)) continue;
              handledPRs.add(pullChangeLog.pr);
              for (const pkg of pullChangeLog.packages) {
                if (pkg.packageName === packageName) {
                  changeLogEntries.push(
                    ...pkg.changes.map((c) => ({...c, pr: pullChangeLog.pr})),
                  );
                }
              }
            }
          }
          const newVersion = getNewVersion(currentVersion, changeLogEntries);
          if (!newVersion) {
            return {
              status: Status.NoUpdateRequired,
              currentVersion,
              packageName,
              pkgInfos,
            };
          }

          return {
            status: Status.NewVersionToBePublished,
            currentVersion,
            newVersion,
            packageName,
            changeLogEntries,
            pkgInfos,
          };
        },
      ),
    )
  ).filter(isTruthy);
  return packages;
}

export function printPackagesStatus(packages: PackageStatus[]) {
  if (packages.some((p) => p.status === Status.MissingTag)) {
    console.error(`Missing tag for:`);
    console.error(``);
    for (const p of packages.filter((p) => p.status === Status.MissingTag)) {
      console.error(`  - ${p.packageName}@${p.currentVersion}`);
    }
    console.error(``);
    return;
  }

  if (packages.some((p) => p.status === Status.NoUpdateRequired)) {
    console.warn(chalk.blue(`# Packages without updates`));
    console.warn(``);
    for (const p of packages.filter(
      (p) => p.status === Status.NoUpdateRequired,
    )) {
      console.warn(
        p.currentVersion
          ? `  - ${p.packageName}@${p.currentVersion}`
          : `  - ${p.packageName}`,
      );
    }
    console.warn(``);
  }

  if (packages.some((p) => p.status === Status.NewVersionToBePublished)) {
    console.warn(chalk.blue(`# Packages to publish`));
    console.warn(``);
    for (const p of packages) {
      if (p.status !== Status.NewVersionToBePublished) continue;
      console.warn(
        chalk.yellow(
          `## ${p.packageName} (${p.currentVersion || 'unreleased'} → ${
            p.newVersion
          })`,
        ),
      );
      console.warn(``);
      console.warn(changesToMarkdown(p.changeLogEntries, 3));
      console.warn(``);
    }
    console.warn(``);
  }
}

export async function prepublishGitHub({
  owner,
  name,
  accessToken,
  dirname,
  deployBranch,
}: Config): Promise<{ok: true; tags: string[]} | {ok: false; reason: string}> {
  const result = (await graphql.defaults({
    headers: {
      authorization: `token ${accessToken}`,
    },
  })(
    `query permissions($owner:String!, $name:String!${
      deployBranch ? `, $deployBranch:String!` : ``
    }) { 
      repository(owner:$owner,name:$name) {
        viewerPermission
        ${
          deployBranch
            ? `branch: ref(qualifiedName: "refs/heads/master")`
            : `branch: defaultBranchRef`
        } {
          name
          target {
            __typename
            oid
          }
        }
      }
      
    }`,
    deployBranch ? {owner, name, deployBranch} : {owner, name},
  )) as {
    repository: {
      viewerPermission: string;
      branch: {name: string; target: {__typename: string; oid: string}};
    };
  } | null;
  const permission =
    result && result.repository && result.repository.viewerPermission;
  if (!permission || !['ADMIN', 'MAINTAIN', 'WRITE'].includes(permission)) {
    return {
      ok: false,
      reason: `This viewer does not have permisison to publish tags/releases to GitHub`,
    };
  }
  if (result?.repository.branch.target.__typename !== 'Commit') {
    return {
      ok: false,
      reason: `Could not find a commit for ${result?.repository.branch.name}.`,
    };
  }
  const headSha = await getHeadSha(dirname);
  if (headSha !== result?.repository.branch.target.oid) {
    return {
      ok: false,
      reason: `This build is not running against the latest commit in ${result?.repository.branch.name}. To avoid awkward race conditions we'll skip publishing here and leave publishing to the other commit.`,
    };
  }

  const allTags = await getAllTags(
    new Octokit({
      headers: {
        authorization: `token ${accessToken}`,
      },
    }),
    {owner, repo: name},
  );
  return {ok: true, tags: allTags.map((t) => t.name)};
}

export async function publishGitHub(
  _config: Config,
  _packageName: string,
  _newVersion: string,
  _tag: string,
) {
  // TODO: create GitHub release
  // const github = new Octokit({
  //   auth: accessToken,
  // });
  // github.repos.createRelease({
  //   /**
  //    * Text describing the contents of the tag.
  //    */
  //   body?: string;
  //   /**
  //    * `true` to create a draft (unpublished) release, `false` to create a published one.
  //    */
  //   draft?: boolean;
  //   /**
  //    * The name of the release.
  //    */
  //   name?: string;
  //   owner: string;
  //   /**
  //    * `true` to identify the release as a prerelease. `false` to identify the release as a full release.
  //    */
  //   prerelease?: boolean;
  //   repo: string;
  //   /**
  //    * The name of the tag.
  //    */
  //   tag_name: string;
  //   /**
  //    * Specifies the commitish value that determines where the Git tag is created from. Can be any branch or commit SHA. Unused if the Git tag already exists. Default: the repository's default branch (usually `master`).
  //    */
  //   target_commitish?: string;
  // });
}

export type PrePublishResult = {ok: true} | {ok: false; reason: string};

export async function prepublish(
  config: Config,
  pkg: PackageInfo,
  newVersion: string,
): Promise<PrePublishResult> {
  switch (pkg.platform) {
    case Platform.npm:
      return await prepublishNpm(config, pkg, newVersion);
  }
}
export async function publish(
  config: Config,
  pkg: PackageInfo,
  newVersion: string,
) {
  switch (pkg.platform) {
    case Platform.npm:
      await publishNpm(config, pkg, newVersion);
      break;
  }
}

async function withNpmVersion<T>(
  config: Config,
  pkg: PackageInfo,
  newVersion: string,
  fn: (dir: string) => Promise<T>,
) {
  const filename = resolve(config.dirname, pkg.path);
  const original = readFileSync(filename, 'utf8');
  const pkgData = JSON.parse(original);
  pkgData.version = newVersion;
  // TODO: we also need to set the versions correctly for:
  // dependencies, peerDependencies & devDependencies
  const str = stringifyPackage(
    pkgData,
    detectIndent(original).indent,
    detectNewline(original),
  );
  try {
    writeFileSync(filename, str);
    return await fn(dirname(filename));
  } finally {
    writeFileSync(filename, original);
  }
}
async function prepublishNpm(
  config: Config,
  pkg: PackageInfo,
  newVersion: string,
): Promise<PrePublishResult> {
  const [profile, packument] = await Promise.all([
    getProfile(),
    getPackument(pkg.packageName, true),
  ]);

  if (!profile) {
    return {ok: false, reason: 'Could not authenticate to npm'};
  }

  if (profile.tfaOnPublish) {
    return {
      ok: false,
      reason:
        'This user requires 2fa on publish to npm, which is not supported',
    };
  }

  if (!packument) {
    if (
      pkg.packageName[0] !== '@' ||
      '@' + profile.name === pkg.packageName.split('/')[0]
    ) {
      return {ok: true};
    } else {
      const orgName = pkg.packageName.split('/')[0].substr(1);
      const orgRoster = await getOrgRoster(orgName);
      if (!orgRoster[profile.name]) {
        return {
          ok: false,
          reason: `@${profile.name} does not appear to have permission to publish new packages to @${orgName} on npm`,
        };
      }
    }
  } else {
    if (!packument.maintainers.some((m) => m.name === profile.name)) {
      return {
        ok: false,
        reason: `The user @${profile.name} is not listed as a maintainer of ${pkg.packageName} on npm`,
      };
    }

    if (newVersion in packument.versions) {
      return {
        ok: false,
        reason: `${pkg.packageName} already has a version ${newVersion} on npm`,
      };
    }
  }

  await withNpmVersion(config, pkg, newVersion, async (cwd) => {
    await spawnBuffered('npm', ['publish', '--dry-run'], {cwd});
  });

  return {ok: true};
}
async function publishNpm(
  config: Config,
  pkg: PackageInfo,
  newVersion: string,
) {
  await withNpmVersion(config, pkg, newVersion, async (cwd) => {
    await spawnBuffered('npm', ['publish'], {cwd});
  });
}
