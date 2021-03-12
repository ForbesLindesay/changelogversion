/**
 * !!! This file is autogenerated do not edit by hand !!!
 *
 * Generated by: @databases/pg-schema-print-types
 * Checksum: wFMN+PyjFQLoR2vR6vE7ejnwDuHzY8WrVxQ7wTmFqDWxiNL2mjEO0bg+ycEHfDZV1kuvJYtotedSgzWOcxgzcw==
 */

// eslint:disable
// tslint:disable

import type DbGitCommit from './git_commits';
import type DbGitRepository from './git_repositories';

interface DbGitTag {
  git_repository_id: DbGitRepository['id'];
  graphql_id: string;
  /**
   * @default nextval('git_tags_id_seq'::regclass)
   */
  id: number & {readonly __brand?: 'git_tags_id'};
  name: string;
  target_git_commit_id: DbGitCommit['id'];
}
export default DbGitTag;

interface GitTags_InsertParameters {
  git_repository_id: DbGitRepository['id'];
  graphql_id: string;
  /**
   * @default nextval('git_tags_id_seq'::regclass)
   */
  id?: number & {readonly __brand?: 'git_tags_id'};
  name: string;
  target_git_commit_id: DbGitCommit['id'];
}
export type {GitTags_InsertParameters};
