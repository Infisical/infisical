import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Switch } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";

export const SecretSharingAllowShareToAnyone = () => {
  const { currentOrg } = useOrganization();
  const { mutateAsync } = useUpdateOrg();

  const handleSecretSharingToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;

    await mutateAsync({
      orgId: currentOrg.id,
      allowSecretSharingOutsideOrganization: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} secret sharing to members outside of this organization`,
      type: "success"
    });
  };

  return (
    <div className="mb-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-2 flex justify-between">
        <h3 className="text-md text-mineshaft-100">
          Allow sharing secrets to members outside of this organization
        </h3>
        <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
          {(isAllowed) => (
            <Switch
              id="enable-secret-sharing-outside-org"
              onCheckedChange={(value) => handleSecretSharingToggle(value)}
              isChecked={currentOrg?.allowSecretSharingOutsideOrganization ?? false}
              isDisabled={!isAllowed}
            />
          )}
        </OrgPermissionCan>
      </div>
      <p className="text-sm text-mineshaft-300">
        If enabled, team members will be able to share secrets to members outside of this
        organization
      </p>
    </div>
  );
};
