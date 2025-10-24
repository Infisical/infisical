import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Checkbox } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api/organization/queries";

export const BlockDuplicateSecretSyncDestinationsSection = () => {
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
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update blocking duplicate secret sync destinations setting for this organization",
        type: "error"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-3 text-xl font-medium">Block Duplicate Secret Sync Destinations</p>
      <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
        {(isAllowed) => (
          <div className="w-max">
            <Checkbox
              id="blockDuplicateSecretSyncDestinations"
              isDisabled={!isAllowed || isLoading}
              isChecked={currentOrg?.blockDuplicateSecretSyncDestinations ?? false}
              onCheckedChange={(state) => handleToggle(state as boolean)}
            >
              This feature prevents creating secret syncs with destinations that are already in use
              by other syncs in your organization.
            </Checkbox>
          </div>
        )}
      </OrgPermissionCan>
    </div>
  );
};
