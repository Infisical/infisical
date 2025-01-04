import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Switch, UpgradePlanModal } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useLogoutUser, useUpdateOrg } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

export const OrgGeneralAuthSection = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const { mutateAsync } = useUpdateOrg();

  const logout = useLogoutUser();

  const handleEnforceOrgAuthToggle = async (value: boolean) => {
    try {
      if (!currentOrg?.id) return;
      if (!subscription?.samlSSO) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await mutateAsync({
        orgId: currentOrg?.id,
        authEnforced: value
      });

      createNotification({
        text: `Successfully ${value ? "enforced" : "un-enforced"} org-level auth`,
        type: "success"
      });

      if (value) {
        await logout.mutateAsync();
        window.open(`/api/v1/sso/redirect/saml2/organizations/${currentOrg.slug}`);
        window.close();
      }
    } catch (err) {
      console.error(err);
      createNotification({
        text: (err as { response: { data: { message: string } } }).response.data.message,
        type: "error"
      });
    }
  };

  return (
    <>
      {/* <div className="py-4">
                <div className="mb-2 flex justify-between">
                    <h3 className="text-md text-mineshaft-100">Allow users to send invites</h3>
                    <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                        {(isAllowed) => (
                            <Switch
                                id="allow-org-invites"
                                onCheckedChange={(value) => handleEnforceOrgAuthToggle(value)}
                                isChecked={currentOrg?.authEnforced ?? false}
                                isDisabled={!isAllowed}
                            />
                        )}
                    </OrgPermissionCan>
                </div>
                <p className="text-sm text-mineshaft-300">Allow members to invite new users to this organization</p>
            </div> */}
      <div className="py-4">
        <div className="mb-2 flex justify-between">
          <h3 className="text-md text-mineshaft-100">Enforce SAML SSO</h3>
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Switch
                id="enforce-org-auth"
                onCheckedChange={(value) => handleEnforceOrgAuthToggle(value)}
                isChecked={currentOrg?.authEnforced ?? false}
                isDisabled={!isAllowed}
              />
            )}
          </OrgPermissionCan>
        </div>
        <p className="text-sm text-mineshaft-300">
          Enforce members to authenticate via SAML to access this organization
        </p>
      </div>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can enforce SAML SSO if you switch to Infisical's Pro plan."
      />
    </>
  );
};
