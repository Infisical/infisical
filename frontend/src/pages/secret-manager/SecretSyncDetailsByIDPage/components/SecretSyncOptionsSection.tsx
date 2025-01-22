import { SecretSyncLabel } from "@app/components/secret-syncs";
import { SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP } from "@app/helpers/secretSyncs";
import { TSecretSync } from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync: TSecretSync;
  // onEditOptions: VoidFunction;
};

export const SecretSyncOptionsSection = ({
  secretSync
  // onEditOptions
}: Props) => {
  const {
    destination,
    syncOptions: {
      // appendSuffix,
      // prependPrefix,
      initialSyncBehavior
    }
  } = secretSync;

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="font-semibold text-mineshaft-100">Sync Options</h3>
          {/* <ProjectPermissionCan
            I={ProjectPermissionSecretSyncActions.Edit}
            a={ProjectPermissionSub.SecretSyncs}
          >
            {(isAllowed) => (
              <IconButton
                variant="plain"
                colorSchema="secondary"
                isDisabled={!isAllowed}
                ariaLabel="Edit sync options"
                onClick={onEditOptions}
              >
                <FontAwesomeIcon icon={faEdit} />
              </IconButton>
            )}
          </ProjectPermissionCan> */}
        </div>
        <div>
          <div className="space-y-3">
            <SecretSyncLabel label="Initial Sync Behavior">
              {SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP[initialSyncBehavior](destination).name}
            </SecretSyncLabel>
            {/* <SecretSyncLabel label="Prefix">{prependPrefix}</SecretSyncLabel>
            <SecretSyncLabel label="Suffix">{appendSuffix}</SecretSyncLabel> */}
          </div>
        </div>
      </div>
    </div>
  );
};
