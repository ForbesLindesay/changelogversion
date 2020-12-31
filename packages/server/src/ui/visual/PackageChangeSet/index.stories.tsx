import * as React from 'react';
import PackageChangeSet from './';
import {PublishTarget} from 'rollingversions/lib/types';
import {createChangeSet} from '@rollingversions/change-set';

export default {title: 'modules/PackageChangeSet'};

export const Default = () => {
  const [changes, setChanges] = React.useState(
    createChangeSet<{localId: number}>(),
  );
  return (
    <div className="w-full min-h-full bg-gray-300 p-2">
      <PackageChangeSet
        packageName="@databases/pg"
        packageManifest={[
          {
            notToBePublished: false,
            versionTag: null,
            targetConfig: {
              type: PublishTarget.npm,
              publishConfigAccess: 'public',
            },
          },
        ]}
        changes={changes}
        disabled={false}
        readOnly={false}
        onChange={(_packageName, update) => setChanges(update)}
      />
    </div>
  );
};
