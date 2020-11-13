/**
 * !!! This file is autogenerated do not edit by hand !!!
 *
 * Generated by: @databases/pg-schema-print-types
 * Checksum: WYacTvBK3ENIKjiMtM8FryCs/cnWExty6WxY4l1XbW9O5vGjvK4P9YiB4iTnYgmgyao573f97rw51lOOYaDTNQ==
 */

// eslint:disable
// tslint:disable

import DbGitRepository from './git_repositories'

interface DbGitCommit {
  commit_sha: string
  git_repository_id: DbGitRepository['id']
  graphql_id: string
  /**
   * Have we fetched the package_manifest_records for this commit
   * 
   * @default false
   */
  has_package_manifests: boolean
  /**
   * @default nextval('git_commits_id_seq'::regclass)
   */
  id: number & {readonly __brand?: 'git_commits_id'}
}
export default DbGitCommit;

interface GitCommits_InsertParameters {
  commit_sha: string
  git_repository_id: DbGitRepository['id']
  graphql_id: string
  /**
   * Have we fetched the package_manifest_records for this commit
   * 
   * @default false
   */
  has_package_manifests?: boolean
  /**
   * @default nextval('git_commits_id_seq'::regclass)
   */
  id?: number & {readonly __brand?: 'git_commits_id'}
}
export type {GitCommits_InsertParameters}
