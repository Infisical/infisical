import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
  Switch
} from "@app/components/v3";
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Allow sharing secrets to members outside of this organization
        </CardTitle>
        <CardDescription>
          If enabled, team members will be able to share secrets to members outside of this
          organization
        </CardDescription>
        <CardAction>
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
            {(isAllowed) => (
              <Switch
                variant="org"
                id="enable-secret-sharing-outside-org"
                onCheckedChange={(value) => handleSecretSharingToggle(value)}
                checked={currentOrg?.allowSecretSharingOutsideOrganization ?? false}
                disabled={!isAllowed}
              />
            )}
          </OrgPermissionCan>
        </CardAction>
      </CardHeader>
    </Card>
  );
};
