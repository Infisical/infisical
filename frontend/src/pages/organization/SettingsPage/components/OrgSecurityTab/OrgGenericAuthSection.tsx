import { Fingerprint } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch
} from "@app/components/v3";
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
  };

  const handleUpdateSelectedMfa = async (selectedMfaMethod: MfaMethod) => {
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
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <Fingerprint className="size-4 text-accent" />
            Multi-Factor Authentication
            {currentOrg?.enforceMfa && <Badge variant="success">Enforced</Badge>}
          </CardTitle>
          <CardDescription>
            Require members to authenticate with MFA to access the organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Enforce MFA</FieldTitle>
                <FieldDescription>
                  Members must complete a second authentication factor to sign in.
                </FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                  <Switch
                    id="enforce-org-mfa"
                    variant="org"
                    checked={currentOrg?.enforceMfa ?? false}
                    onCheckedChange={handleEnforceMfaToggle}
                    disabled={!isAllowed}
                  />
                )}
              </OrgPermissionCan>
            </Field>
            {currentOrg?.enforceMfa && (
              <Field>
                <FieldLabel htmlFor="org-mfa-method">MFA Method</FieldLabel>
                <Select
                  value={currentOrg.selectedMfaMethod ?? MfaMethod.EMAIL}
                  onValueChange={(value) => handleUpdateSelectedMfa(value as MfaMethod)}
                >
                  <SelectTrigger id="org-mfa-method" className="w-full max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value={MfaMethod.EMAIL} key="mfa-method-email">
                      Email
                    </SelectItem>
                    <SelectItem value={MfaMethod.TOTP} key="mfa-method-totp">
                      Mobile Authenticator
                    </SelectItem>
                    <SelectItem value={MfaMethod.WEBAUTHN} key="mfa-method-webauthn">
                      Passkey (WebAuthn)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to enforce user MFA. To unlock this feature, please upgrade to Infisical Pro plan."
      />
    </>
  );
};
