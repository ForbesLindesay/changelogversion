/**
 * !!! This file is autogenerated do not edit by hand !!!
 *
 * Generated by: @databases/pg-schema-print-types
 * Checksum: PR8asGFHRq/TTyYwxZ0uZHci+0ITMCYhrybZrfmiLmixHlIMyPsbWFSRdT76J0ivY9+6TmGWe7IwU1rrb0dLTw==
 */

// eslint:disable
// tslint:disable

import DbGitRepository from './git_repositories';

interface DbPullRequest {
  change_set_submitted_at_git_commit_sha: string | null;
  comment_id: number | null;
  comment_updated_at_commit_sha: string | null;
  git_repository_id: DbGitRepository['id'];
  graphql_id: string;
  /**
   * The databaseId from GitHub
   */
  id: number & {readonly __brand?: 'pull_requests_id'};
  /**
   * @default false
   */
  is_closed: boolean;
  /**
   * @default false
   */
  is_merged: boolean;
  merge_commit_sha: string | null;
  pr_number: number;
  status_updated_at_commit_sha: string | null;
  title: string;
}
export default DbPullRequest;

interface PullRequests_InsertParameters {
  change_set_submitted_at_git_commit_sha?: string | null;
  comment_id?: number | null;
  comment_updated_at_commit_sha?: string | null;
  git_repository_id: DbGitRepository['id'];
  graphql_id: string;
  /**
   * The databaseId from GitHub
   */
  id: number & {readonly __brand?: 'pull_requests_id'};
  /**
   * @default false
   */
  is_closed?: boolean;
  /**
   * @default false
   */
  is_merged?: boolean;
  merge_commit_sha?: string | null;
  pr_number: number;
  status_updated_at_commit_sha?: string | null;
  title: string;
}
export type {PullRequests_InsertParameters};
