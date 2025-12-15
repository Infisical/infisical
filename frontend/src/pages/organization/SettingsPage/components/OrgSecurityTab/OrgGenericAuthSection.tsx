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
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { usePopUp } from "@app/hooks/usePopUp";

export const OrgGenericAuthSection = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const { mutateAsync } = useUpdateOrg();

  const handleEnforceMfaToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;
    if (!subscription?.get(SubscriptionProductCategory.Platform, "enforceMfa")) {
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
  };

  const handleUpdateSelectedMfa = async (selectedMfaMethod: MfaMethod) => {
    if (!currentOrg?.id) return;
    if (!subscription?.get(SubscriptionProductCategory.Platform, "enforceMfa")) {
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
              <SelectItem value={MfaMethod.WEBAUTHN} key="mfa-method-webauthn">
                Passkey (WebAuthn)
              </SelectItem>
            </Select>
          </FormControl>
        )}
      </div>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to enforce user MFA. To unlock this feature, please upgrade to Infisical Pro plan."
      />
    </div>
  );
};
