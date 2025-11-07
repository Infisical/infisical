import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Switch } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api/organization/queries";

export const OrgProductSettingsTab = () => {
  const { currentOrg } = useOrganization();
  const { mutateAsync: updateOrg } = useUpdateOrg();

  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (state: boolean) => {
    setIsLoading(true);

    try {
      if (!currentOrg?.id) {
        setIsLoading(false);
        return;
      }

      await updateOrg({
        orgId: currentOrg.id,
        blockDuplicateSecretSyncDestinations: state
      });

      createNotification({
        text: `Successfully ${state ? "enabled" : "disabled"} blocking duplicate secret sync destinations for this organization`,
        type: "success"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <div className="mb-6">
        <h2 className="text-xl font-medium text-mineshaft-100">Secrets Management</h2>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="mb-2 text-lg font-medium text-mineshaft-100">
            Unique Secret Sync Destination Policy
          </h3>
          <p className="text-sm text-mineshaft-400">
            When enabled, ensures each destination can only be used by one secret sync
            configuration, preventing potential conflicts or overwrites.
          </p>
        </div>
        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
          {(isAllowed) => (
            <Switch
              id="blockDuplicateSecretSyncDestinations"
              isDisabled={!isAllowed || isLoading}
              isChecked={currentOrg?.blockDuplicateSecretSyncDestinations ?? false}
              onCheckedChange={(state) => handleToggle(state as boolean)}
            />
          )}
        </OrgPermissionCan>
      </div>
    </div>
  );
};
