import {PrePublishResult} from '../types';
import PackageManifest from '../types/PackageManifest';
import {PublishConfig} from '../types/publish';
import {PublishTargetConfig} from '../types/PublishTarget';
import {NewVersionToBePublished} from '../utils/getPackageStatuses';

export interface BaseTargetConfig<T extends PublishTargetConfig> {
  type: T['type'];
  pathMayContainPackage(filename: string): boolean;
  getPackageManifest(
    path: string,
    content: string,
  ): Promise<PackageManifest | null>;
  prepublish(
    config: PublishConfig,
    pkg: NewVersionToBePublished,
    targetConfig: T,
    packageVersions: Map<string, string | null>,
  ): Promise<PrePublishResult>;
  publish(
    config: PublishConfig,
    pkg: NewVersionToBePublished,
    targetConfig: T,
    packageVersions: Map<string, string | null>,
  ): Promise<void>;
}

export interface BaseTarget {
  pathMayContainPackage(filename: string): boolean;
  getPackageManifest(
    path: string,
    content: string,
  ): Promise<PackageManifest | null>;
  prepublish(
    config: PublishConfig,
    pkg: NewVersionToBePublished,
    targetConfig: PublishTargetConfig,
    packageVersions: Map<string, string | null>,
  ): Promise<PrePublishResult | null>;
  publish(
    config: PublishConfig,
    pkg: NewVersionToBePublished,
    targetConfig: PublishTargetConfig,
    packageVersions: Map<string, string | null>,
  ): Promise<null | true>;
}

export default function createPublishTargetAPI<T extends PublishTargetConfig>(
  target: BaseTargetConfig<T>,
): BaseTarget {
  function isTargetConfig(config: PublishTargetConfig): config is T {
    return config.type === target.type;
  }
  return {
    pathMayContainPackage: (filename) => target.pathMayContainPackage(filename),
    getPackageManifest: (filename, content) =>
      target.getPackageManifest(filename, content),
    prepublish: (config, pkg, targetConfig, packageVersions) => {
      return isTargetConfig(targetConfig)
        ? target.prepublish(config, pkg, targetConfig, packageVersions)
        : Promise.resolve(null);
    },
    publish: async (config, pkg, targetConfig, packageVersions) => {
      if (isTargetConfig(targetConfig)) {
        await target.publish(config, pkg, targetConfig, packageVersions);
        return true;
      }
      return null;
    },
  };
}
