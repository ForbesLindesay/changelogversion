import ChangeSet, {ChangeSetEntry} from '@rollingversions/change-set';
import {
  PullRequest,
  PackageDependencies,
  PackageManifestWithVersion,
} from 'rollingversions/lib/types';
import {
  Queryable,
  getChangesForPullRequest,
  getCommitIdFromSha,
  isPullRequestReleased,
} from '../../services/postgres';
import {
  GitHubClient,
  getAllPullRequestCommits,
  GitHubCommit,
} from '../../services/github';
import addRepository from '../procedures/addRepository';
import upsertPullRequest from '../procedures/upsertPullRequest';
import upsertCommits from '../procedures/upsertCommits';
import getEmptyChangeSet from 'rollingversions/lib/utils/getEmptyChangeSet';
import addPackageVersions from 'rollingversions/lib/utils/addPackageVersions';
import isTruthy from 'rollingversions/lib/ts-utils/isTruthy';
import readRepository from '../procedures/readRepository';
import {Logger} from '../../logger';
import {getPackageManifests} from '../../models/PackageManifests';

interface PullRequestPackage {
  manifests: PackageManifestWithVersion[];
  dependencies: PackageDependencies;
  changeSet: ChangeSet<{id: number; weight: number}>;
  released: boolean;
}

export default async function readPullRequestState(
  db: Queryable,
  client: GitHubClient,
  pullRequest: Pick<PullRequest, 'repo' | 'number'>,
  logger: Logger,
) {
  const repo =
    (await logger.withLogging(readRepository(db, pullRequest.repo), {
      success: 'read_repository',
      successMessage: 'Read repository from db',
      failure: 'failed_read_repository',
    })) ||
    (await logger.withLogging(
      addRepository(
        db,
        client,
        pullRequest.repo,
        {
          refreshPRs: false,
          refreshTags: false,
        },
        logger,
      ),
      {
        success: 'added_repository',
        successMessage: 'Added repository',
        failure: 'failed_add_repository',
      },
    ));

  const {
    id,
    is_closed,
    is_merged,
    commentID,
    submittedAtCommitSha,
  } = await logger.withLogging(
    upsertPullRequest(db, client, repo.id, repo, pullRequest.number, logger),
    {
      success: 'upserted_pr',
      successMessage: 'Upserted pull request',
      failure: 'failed_upsert_pr',
    },
  );
  const head = await logger.withLogging(
    upsertCommits(
      db,
      client,
      repo.id,
      repo,
      getAllPullRequestCommits(client, repo, pullRequest.number),
      {forceFullScan: false},
      logger,
    ),
    {
      success: 'upserted_pr_commits',
      successMessage: 'Upserted pull request commits',
      failure: 'failed_upsert_pr_commits',
    },
  );

  const [changes, packages] = await Promise.all([
    logger.withLogging(getChangesForPullRequest(db, id), {
      success: 'got_changes_for_pr',
      successMessage: 'Got changes for pull request',
      failure: 'failed_get_changes',
    }),
    logger
      .withLogging(
        getPackageManifestsForPr(db, client, repo, head || null, logger),
        {
          success: 'got_package_manifests_for_pr',
          successMessage: 'Got package manifests for pr',
          failure: 'failed_get_package_manifests_for_pr',
        },
      )
      .then((packages) => addPackageVersions(packages, repo.tags)),
  ]);

  const changeSets = new Map<
    string,
    ChangeSetEntry<{id: number; weight: number}>[]
  >();
  for (const change of changes) {
    let changeSet = changeSets.get(change.package_name);
    if (!changeSet) {
      changeSet = [];
      changeSets.set(change.package_name, changeSet);
    }
    changeSet.push({
      id: change.id,
      weight: change.sort_order_weight,
      type: change.kind,
      title: change.title,
      body: change.body,
    });
  }

  const missingPackages = [
    ...new Set(
      changes.map((c) => c.package_name).filter((pn) => !packages.has(pn)),
    ),
  ].map((packagName): [
    string,
    {
      manifests: PackageManifestWithVersion[];
      dependencies: PackageDependencies;
    },
  ] => [
    packagName,
    {
      manifests: [],
      dependencies: {required: [], optional: [], development: []},
    },
  ]);
  return {
    id,
    repo,
    headSha: head?.commit_sha || null,
    submittedAtCommitSha,
    commentID,
    is_closed,
    is_merged,
    packages: new Map<string, PullRequestPackage>(
      await Promise.all(
        [...packages, ...missingPackages].map(
          async ([packageName, metadata]): Promise<
            [string, PullRequestPackage]
          > => {
            return [
              packageName,
              {
                ...metadata,
                changeSet: changeSets.get(packageName) || getEmptyChangeSet(),
                released:
                  is_merged &&
                  (await isPullRequestReleased(db, {
                    releasedCommitIDs: new Set(
                      metadata.manifests
                        .map(({versionTag}) => {
                          if (!versionTag) return undefined;
                          return repo.tags.find(
                            (t2) => t2.name === versionTag?.name,
                          );
                        })
                        .filter(isTruthy)
                        .map((versionTag) => versionTag.target_git_commit_id),
                    ),
                    pullRequestID: id,
                  })),
              },
            ];
          },
        ),
      ),
    ),
  };
}

async function getPackageManifestsForPr(
  db: Queryable,
  client: GitHubClient,
  repo: {
    id: number;
    head: {id: number} | undefined | null;
  },
  head: GitHubCommit | null,
  logger: Logger,
) {
  if (head) {
    // TODO: only use this head if the PR is open
    // (once we are able to display changes on packages that no longer exist)
    const id = await getCommitIdFromSha(db, repo.id, head.commit_sha);
    if (id) {
      return getPackageManifests(db, client, id, logger);
    }
  }
  if (repo.head) {
    return getPackageManifests(db, client, repo.head.id, logger);
  }
  // TODO: report this error to users
  throw new Error('Could not find package manifests for this pull request');
}
