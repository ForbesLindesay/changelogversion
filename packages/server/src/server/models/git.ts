import {URL} from 'url';

import type {SQLQuery} from '@rollingversions/db';
import {Queryable, sql} from '@rollingversions/db';
import {q} from '@rollingversions/db';
import {tables} from '@rollingversions/db';
import DbChangeLogEntry from '@rollingversions/db/change_log_entries';
import type {GitCommits_InsertParameters} from '@rollingversions/db/git_commits';
import type DbGitCommit from '@rollingversions/db/git_commits';
import type DbGitRef from '@rollingversions/db/git_refs';
import type {GitRefs_InsertParameters} from '@rollingversions/db/git_refs';
import type DbGitRepository from '@rollingversions/db/git_repositories';
import type DbPullRequest from '@rollingversions/db/pull_requests';
import * as git from '@rollingversions/git-http';
import * as gitObj from '@rollingversions/git-objects';

import dedupeByKey from '../../utils/dedupeByKey';
import groupByKey from '../../utils/groupByKey';
import {getTokenForRepo} from '../getClient';
import type {Logger} from '../logger';
import type {GitHubClient} from '../services/github';

function notNull<T>(value: T | null | undefined): T {
  if (value == null) {
    throw new Error(`Expected value but got null or undefined`);
  }
  return value;
}

const CONFLICTING_UPDATES_ERROR = new Error(
  `Two conflicting attempts to update the same git repository were made.`,
);
const dedupe = dedupeByKey<DbGitRepository['id'], void>();
async function getHttpHandler(
  repo: DbGitRepository,
): Promise<git.HttpInterface<Headers>> {
  const accessToken = await getTokenForRepo(repo);
  const headerValue = `Basic ${Buffer.from(
    `x-access-token:${accessToken}`,
  ).toString(`base64`)}`;
  return {
    ...git.DEFAULT_HTTP_HANDLER,
    createHeaders(url: URL) {
      const headers = git.DEFAULT_HTTP_HANDLER.createHeaders(url);

      // https://docs.github.com/en/developers/apps/authenticating-with-github-apps#http-based-git-access-by-an-installation
      // x-access-token:<token>
      headers.set('Authorization', headerValue);

      return headers;
    },
  };
}

export async function markRepoAsUpdated(
  db: Queryable,
  repo: DbGitRepository,
): Promise<DbGitRepository> {
  let r = repo;
  while (true) {
    const updatedRecords = await tables.git_repositories(db).update(
      {
        id: r.id,
        remote_git_version: r.remote_git_version,
      },
      {remote_git_version: r.remote_git_version + 1},
    );
    if (updatedRecords.length === 1) {
      return updatedRecords[0];
    } else {
      r = notNull(await tables.git_repositories(db).findOne({id: r.id}));
    }
  }
}

export async function updateRepoIfChanged(
  db: Queryable,
  _client: GitHubClient,
  repoID: DbGitRepository['id'],
  logger: Logger,
): Promise<void> {
  return await dedupe(repoID, async () => {
    let repo = notNull(await tables.git_repositories(db).findOne({id: repoID}));
    while (repo.remote_git_version !== repo.local_git_version) {
      const http = await getHttpHandler(repo);
      const repoURL = new URL(
        `https://github.com/${repo.owner}/${repo.name}.git`,
      );

      logger.info(`git_init`, `Git init request ${repoURL.href}`);
      const {capabilities: serverCapabilities} = await git.initialRequest(
        repoURL,
        {
          http,
          agent: 'rollingversions.com',
        },
      );

      logger.info(`git_lsrefs`, `Git ls refs request ${repoURL.href}`);
      const [remoteRefs, localRefs] = await Promise.all([
        git.asyncIteratorToArray(
          git.lsRefs(
            repoURL,
            {
              // TODO: what do we need here?
              // symrefs: true,
              refPrefix: ['refs/heads/', 'refs/tags/', 'refs/pull/'],
            },
            {
              http,
              agent: 'rollingversions.com',
              serverCapabilities,
            },
          ),
        ),
        tables
          .git_refs(db)
          .find({
            git_repository_id: repo.id,
          })
          .select(`kind`, `name`, `commit_sha`)
          .all(),
      ]);

      const remoteRefNames = new Set(remoteRefs.map((r) => r.refName));
      const refsToDelete = localRefs.filter(
        (ref) => !remoteRefNames.has(`refs/${ref.kind}/${ref.name}`),
      );
      const localRefsMap = new Map(
        localRefs.map((ref) => [
          `refs/${ref.kind}/${ref.name}`,
          ref.commit_sha,
        ]),
      );
      const refsToUpsert = remoteRefs
        .filter((ref) => ref.objectID !== localRefsMap.get(ref.refName))
        .map(
          (ref): GitRefs_InsertParameters => {
            const match = /^refs\/([^\/]+)\/(.+)$/.exec(ref.refName);
            if (!match) {
              throw new Error(`Invalid ref format "${ref.refName}"`);
            }
            const prRefMatch = /^refs\/pull\/(\d+)\/(head|merge)$/.exec(
              ref.refName,
            );
            return {
              git_repository_id: repo.id,
              kind: match[1],
              name: match[2],
              commit_sha: ref.objectID,
              pr_number: prRefMatch ? parseInt(prRefMatch[1], 10) : null,
              pr_ref_kind: prRefMatch ? prRefMatch[2] : null,
            };
          },
        );

      const localRefShas = new Set(localRefs.map((ref) => ref.commit_sha));
      const missingShas = new Set(
        remoteRefs
          .map((ref) => ref.objectID)
          .filter((objectID) => !localRefShas.has(objectID)),
      );

      let newCommits: GitCommits_InsertParameters[] = [];
      if (missingShas.size) {
        logger.info(`git_fetch_objects`, `Git fetch request ${repoURL.href}`);
        for await (const entry of git.fetchObjects(
          repoURL,
          {
            want: [...missingShas],
            have: [...localRefShas],
            filter: [git.treeDepth(0)],
          },
          {
            http,
            agent: 'rollingversions.com',
            serverCapabilities,
          },
        )) {
          if (entry.kind === git.FetchResponseEntryKind.Object) {
            if (gitObj.objectIsCommit(entry.body)) {
              const commit = gitObj.decodeObject(entry.body);
              newCommits.push({
                git_repository_id: repo.id,
                commit_sha: entry.hash,
                message: commit.body.message,
                parents: commit.body.parents,
              });
            }
          }
          if (newCommits.length >= 500) {
            await tables.git_commits(db).insertOrIgnore(...newCommits);
            newCommits = [];
          }
        }
      }
      if (newCommits.length) {
        await tables.git_commits(db).insertOrIgnore(...newCommits);
      }

      logger.info(`git_update_refs`, `Git update refs ${repoURL.href}`);
      try {
        repo = await db.tx(async (db) => {
          await tables
            .git_refs(db)
            .insertOrUpdate(
              [`git_repository_id`, `kind`, `name`],
              ...refsToUpsert,
            );
          const groupsToDelete = groupByKey(refsToDelete, (r) => r.kind);
          for (const [kind, refs] of groupsToDelete) {
            await tables.git_refs(db).delete({
              git_repository_id: repo.id,
              kind,
              name: q.anyOf(refs.map((r) => r.name)),
            });
          }
          const updated = await tables
            .git_repositories(db)
            .update(
              {id: repo.id, local_git_version: repo.local_git_version},
              {local_git_version: repo.remote_git_version},
            );
          if (updated.length !== 1) {
            throw CONFLICTING_UPDATES_ERROR;
          }
          return updated[0];
        });
      } catch (ex) {
        if (ex !== CONFLICTING_UPDATES_ERROR) {
          throw ex;
        }
        repo = notNull(await tables.git_repositories(db).findOne({id: repoID}));
      }
    }
  });
}

async function getCommitByRef(
  db: Queryable,
  client: GitHubClient,
  repo: DbGitRepository,
  kind: 'heads' | 'tags' | 'pull',
  name: string,
  logger: Logger,
): Promise<DbGitCommit | null> {
  await updateRepoIfChanged(db, client, repo.id, logger);

  const ref = await tables.git_refs(db).findOne({
    git_repository_id: repo.id,
    kind,
    name,
  });
  if (!ref) return null;

  const commit = await tables.git_commits(db).findOne({
    git_repository_id: repo.id,
    commit_sha: ref.commit_sha,
  });
  return commit;
}

export async function getCommitBySha(
  db: Queryable,
  client: GitHubClient,
  repo: DbGitRepository,
  commitSha: string,
  logger: Logger,
) {
  await updateRepoIfChanged(db, client, repo.id, logger);

  const commit = await tables.git_commits(db).findOne({
    git_repository_id: repo.id,
    commit_sha: commitSha,
  });
  return commit;
}

export async function getTagHeadCommit(
  db: Queryable,
  client: GitHubClient,
  repo: DbGitRepository,
  tagName: string,
  logger: Logger,
) {
  return await getCommitByRef(db, client, repo, `tags`, tagName, logger);
}
export async function getBranchHeadCommit(
  db: Queryable,
  client: GitHubClient,
  repo: DbGitRepository,
  branchName: string,
  logger: Logger,
) {
  return await getCommitByRef(db, client, repo, `heads`, branchName, logger);
}
export async function getPullRequestHeadCommit(
  db: Queryable,
  client: GitHubClient,
  repo: DbGitRepository,
  pullRequest: DbPullRequest,
  logger: Logger,
) {
  return await getCommitByRef(
    db,
    client,
    repo,
    `pull`,
    `${pullRequest.pr_number}/head`,
    logger,
  );
}

function selectRecursiveUnion(q: {
  name: SQLQuery;
  fields: SQLQuery;
  from: SQLQuery;
  where: SQLQuery;
  whereHead: SQLQuery;
  whereJoin: SQLQuery;
}) {
  return sql`
    ${q.name} AS (
      SELECT ${q.fields}
      FROM ${q.from}
      WHERE ${q.where} AND ${q.whereHead}
      UNION
      SELECT ${q.fields}
      FROM ${q.from}
      INNER JOIN ${q.name} ON (${q.where} AND ${q.whereJoin})
    )
  `;
}
function selectCommits({
  repositoryID,
  includedCommits,
  excludedCommits,
}: {
  repositoryID: DbGitRepository['id'];
  includedCommits: Set<string>;
  excludedCommits: Set<string>;
}) {
  const includedCommitsQuery =
    includedCommits.size === 1
      ? sql`${[...includedCommits][0]}`
      : sql`ANY(${[...includedCommits]})`;
  if (excludedCommits.size === 0) {
    return sql`WITH RECURSIVE ${selectRecursiveUnion({
      name: sql`commits`,
      fields: sql`c.*`,
      from: sql`git_commits c`,
      where: sql`c.git_repository_id = ${repositoryID}`,
      whereHead: sql`c.commit_sha = ${includedCommitsQuery}`,
      whereJoin: sql`c.commit_sha = ANY(commits.parents)`,
    })}`;
  }
  const excludedCommitsQuery =
    excludedCommits.size === 1
      ? sql`${[...excludedCommits][0]}`
      : sql`ANY(${[...excludedCommits]})`;

  return sql`
    WITH RECURSIVE
      ${selectRecursiveUnion({
        name: sql`excluded_commits`,
        fields: sql`c.commit_sha, c.parents`,
        from: sql`git_commits c`,
        where: sql`c.git_repository_id = ${repositoryID}`,
        whereHead: sql`c.commit_sha = ${excludedCommitsQuery}`,
        whereJoin: sql`c.commit_sha = ANY(excluded_commits.parents)`,
      })},
      ${selectRecursiveUnion({
        name: sql`commits`,
        fields: sql`c.*`,
        from: sql`git_commits c`,
        where: sql`c.git_repository_id = ${repositoryID} AND c.commit_sha NOT IN (SELECT commit_sha FROM excluded_commits)`,
        whereHead: sql`c.commit_sha = ${includedCommitsQuery}`,
        whereJoin: sql`c.commit_sha = ANY(commits.parents)`,
      })}
    `;
}

export async function getAllBranches(
  db: Queryable,
  client: GitHubClient,
  repo: DbGitRepository,
  logger: Logger,
): Promise<DbGitRef[]> {
  await updateRepoIfChanged(db, client, repo.id, logger);

  const refs = await tables
    .git_refs(db)
    .find({
      git_repository_id: repo.id,
      kind: 'heads',
    })
    .orderByAsc(`name`)
    .all();
  return refs;
}
export async function getAllTags(
  db: Queryable,
  client: GitHubClient,
  repo: DbGitRepository,
  logger: Logger,
): Promise<DbGitRef[]> {
  await updateRepoIfChanged(db, client, repo.id, logger);

  const refs = await tables
    .git_refs(db)
    .find({
      git_repository_id: repo.id,
      kind: 'tags',
    })
    .orderByAsc(`name`)
    .all();
  return refs;
}

export async function getAllTagsOnBranch(
  db: Queryable,
  headCommit: DbGitCommit,
): Promise<DbGitRef[]> {
  return await db.query(sql`
    ${selectCommits({
      repositoryID: headCommit.git_repository_id,
      includedCommits: new Set([headCommit.commit_sha]),
      excludedCommits: new Set(),
    })}
    SELECT r.*
    FROM git_refs AS r
    INNER JOIN commits AS c ON (r.commit_sha = c.commit_sha)
    WHERE r.git_repository_id = ${headCommit.git_repository_id}
  `);
}

export async function getUnreleasedChanges(
  db: Queryable,
  repo: DbGitRepository,
  {
    packageName,
    headCommitSha,
    releasedCommits,
  }: {
    packageName: string;
    headCommitSha: string;
    releasedCommits: Set<string>;
  },
): Promise<(DbChangeLogEntry & {pr_number: DbPullRequest['pr_number']})[]> {
  return await db.query(sql`
    ${selectCommits({
      repositoryID: repo.id,
      includedCommits: new Set([headCommitSha]),
      excludedCommits: releasedCommits,
    })}
    SELECT DISTINCT ON (change.id) change.*, pr.pr_number
    FROM change_log_entries AS change
    INNER JOIN pull_requests AS pr ON (
      pr.git_repository_id = ${repo.id} AND pr.id = change.pull_request_id
    )
    LEFT OUTER JOIN git_refs AS ref ON (
      ref.git_repository_id = ${repo.id} AND ref.pr_number = pr.pr_number
    )
    INNER JOIN commits AS c ON (
      pr.merge_commit_sha = c.commit_sha OR
      ref.commit_sha = c.commit_sha
    )
    WHERE change.package_name = ${packageName}
    ORDER BY change.id ASC
  `);
}

export async function isCommitReleased(
  db: Queryable,
  repo: DbGitRepository,
  {
    commitShaToCheck,
    releasedCommits,
  }: {
    commitShaToCheck: string;
    releasedCommits: Set<string>;
  },
): Promise<boolean> {
  const [{result}] = await db.query(sql`
    ${selectCommits({
      repositoryID: repo.id,
      includedCommits: releasedCommits,
      excludedCommits: new Set(),
    })}
    SELECT COUNT(*) as result
    FROM  commits AS c
    WHERE c.commit_sha = ${commitShaToCheck}
  `);
  return parseInt(`${result}`, 10) === 1;
}
