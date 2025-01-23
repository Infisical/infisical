import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { FormControl, Select, SelectItem, Switch } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { usePopUp } from "@app/hooks/usePopUp";

export const OrgGenericAuthSection = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const { mutateAsync } = useUpdateOrg();

  const handleEnforceMfaToggle = async (value: boolean) => {
    try {
      if (!currentOrg?.id) return;
      if (!subscription?.enforceMfa) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await mutateAsync({
        orgId: currentOrg?.id,
        enforceMfa: value
      });

      createNotification({
        text: `Successfully ${value ? "enforced" : "un-enforced"} MFA`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: (err as { response: { data: { message: string } } }).response.data.message,
        type: "error"
      });
    }
  };

  const handleUpdateSelectedMfa = async (selectedMfaMethod: MfaMethod) => {
    try {
      if (!currentOrg?.id) return;
      if (!subscription?.enforceMfa) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      await mutateAsync({
        orgId: currentOrg?.id,
        selectedMfaMethod
      });

      createNotification({
        text: "Successfully updated selected MFA method",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: (err as { response: { data: { message: string } } }).response.data.message,
        type: "error"
      });
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <div className="py-4">
        <div className="mb-2 flex justify-between">
          <h3 className="text-md text-mineshaft-100">Enforce Multi-factor Authentication</h3>
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Switch
                id="enforce-org-mfa"
                onCheckedChange={(value) => handleEnforceMfaToggle(value)}
                isChecked={currentOrg?.enforceMfa ?? false}
                isDisabled={!isAllowed}
              />
            )}
          </OrgPermissionCan>
        </div>
        <p className="text-sm text-mineshaft-300">
          Enforce members to authenticate with MFA in order to access the organization
        </p>
        {currentOrg?.enforceMfa && (
          <FormControl label="Selected 2FA method" className="mt-3">
            <Select
              className="min-w-[20rem] border border-mineshaft-500"
              onValueChange={handleUpdateSelectedMfa}
              defaultValue={currentOrg.selectedMfaMethod ?? MfaMethod.EMAIL}
            >
              <SelectItem value={MfaMethod.EMAIL} key="mfa-method-email">
                Email
              </SelectItem>
              <SelectItem value={MfaMethod.TOTP} key="mfa-method-totp">
                Mobile Authenticator
              </SelectItem>
            </Select>
          </FormControl>
        )}
      </div>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can enforce user MFA if you switch to Infisical's Pro plan."
      />
    </div>
  );
};
