import {URL} from 'url';

import {PublishTargetConfig} from '@rollingversions/types';

import {NewVersionToBePublished, PackageStatusDetail} from './PackageStatus';

export interface PublishConfig {
  dryRun: boolean;
  dirname: string;
  owner: string;
  name: string;
  accessToken: string;
  deployBranch: string | null;
  logger: PublishEventHandlers;
  canary: string | null;
  allowNonLatestCommit: boolean;
  allowAnyBranch: boolean;
  backend: URL;
}

export interface PublishEvents {
  onValidatedPackages: {
    packages: readonly PackageStatusDetail[];
    dryRun: boolean;
  };

  onCanaryGitHubRelease: {
    pkg: NewVersionToBePublished;
    dryRun: boolean;
  };

  onPublishGitHubRelease: {
    pkg: NewVersionToBePublished;
    tagName: string;
    dryRun: boolean;
  };
  onPublishedGitHubRelease: {
    pkg: NewVersionToBePublished;
    tagName: string;
    dryRun: boolean;
    response?: unknown;
  };

  onPublishTargetRelease: {
    pkg: NewVersionToBePublished;
    target: PublishTargetConfig;
    dryRun: boolean;
  };
  onPublishedTargetRelease: {
    pkg: NewVersionToBePublished;
    target: PublishTargetConfig;
    dryRun: boolean;
  };
}

export type PublishEventHandlers = {
  [name in keyof PublishEvents]?: (e: PublishEvents[name]) => void;
};
