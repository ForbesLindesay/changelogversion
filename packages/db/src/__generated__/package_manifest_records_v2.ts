/**
 * !!! This file is autogenerated do not edit by hand !!!
 *
 * Generated by: @databases/pg-schema-print-types
 * Checksum: Crw2yphPAjh+yA+YTPkszH0mTvJ98jZoSqtzRcx53cjRHmW//+jkr2pOsRvWdrjTcHBoR5Or51Wy+bhgUYjjlA==
 */

// eslint:disable
// tslint:disable

import DbGitCommit from './git_commits';

interface DbPackageManifestRecordsV2 {
  git_commit_id: DbGitCommit['id'];
  /**
   * @default nextval('package_manifest_records_v2_id_seq'::regclass)
   */
  id: number & {readonly __brand?: 'package_manifest_records_v2_id'};
  manifest: import('rollingversions/lib/types/PackageManifest').default;
  package_name: string;
  schema_version: number;
}
export default DbPackageManifestRecordsV2;

interface PackageManifestRecordsV2_InsertParameters {
  git_commit_id: DbGitCommit['id'];
  /**
   * @default nextval('package_manifest_records_v2_id_seq'::regclass)
   */
  id?: number & {readonly __brand?: 'package_manifest_records_v2_id'};
  manifest: import('rollingversions/lib/types/PackageManifest').default;
  package_name: string;
  schema_version: number;
}
export type {PackageManifestRecordsV2_InsertParameters};