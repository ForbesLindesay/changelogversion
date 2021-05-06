/**
 * !!! This file is autogenerated do not edit by hand !!!
 *
 * Generated by: @databases/pg-schema-print-types
 * Checksum: 6KLkkB7fJ+oac2A/X7bd5yMXQr4dNQeiTab/Ru7CtYgfbEu2lfJ8INOX5alU5udttjamXhzZb5w35WMmz61n6Q==
 */

// eslint:disable
// tslint:disable

import type DbGitRepository from './git_repositories';

interface DbGitCommit {
  commit_sha: string & {readonly __brand?: 'git_commits_commit_sha'};
  git_repository_id: DbGitRepository['id'];
  message: string;
  parents: Array<string | null>;
}
export default DbGitCommit;

interface GitCommits_InsertParameters {
  commit_sha: string & {readonly __brand?: 'git_commits_commit_sha'};
  git_repository_id: DbGitRepository['id'];
  message: string;
  parents: Array<string | null>;
}
export type {GitCommits_InsertParameters};
