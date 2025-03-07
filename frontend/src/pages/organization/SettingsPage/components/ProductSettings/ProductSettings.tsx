import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { ContentLoader, Switch } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";

const ProductConfigSection = () => {
  const { currentOrg } = useOrganization();
  const { mutateAsync } = useUpdateOrg();

  const handleDisplayAllMembersInviteToggle = async (value: boolean) => {
    try {
      if (!currentOrg?.id) return;

      await mutateAsync({
        orgId: currentOrg?.id,
        displayAllMembersInvite: value
      });

      createNotification({
        text: `Successfully ${value ? "enabled" : "disabled"} display all members invite`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update setting",
        type: "error"
      });
    }
  };

  if (!currentOrg) {
    return <ContentLoader />;
  }

  return (
    <div className="mb-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <div className="py-4">
        <div className="mb-2 flex justify-between">
          <h3 className="text-md text-mineshaft-100">
            Display All Members Invite on Project Creation
          </h3>
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
            {(isAllowed) => (
              <Switch
                id="display-all-members-invite"
                onCheckedChange={(value) => handleDisplayAllMembersInviteToggle(value)}
                isChecked={currentOrg?.displayAllMembersInvite ?? false}
                isDisabled={!isAllowed}
              />
            )}
          </OrgPermissionCan>
        </div>
        <p className="text-sm text-mineshaft-300">
          Control whether to display all members in the invite section on project creation
        </p>
      </div>
    </div>
  );
};

export const ProductSettings = () => {
  return (
    <div>
      <ProductConfigSection />
    </div>
  );
};
