import { MfaEnforcementUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle
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
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="p-6">
          <CardTitle>
            Multi-Factor Authentication
            {currentOrg?.enforceMfa && <Badge variant="success">Enforced</Badge>}
          </CardTitle>
          <CardDescription>
            Require members to authenticate with MFA to access the organization.
          </CardDescription>
          <CardAction className="@xs:self-center">
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
              {(isAllowed) => (
                <Toggle
                  id="enforce-org-mfa"
                  variant="org"
                  checked={currentOrg?.enforceMfa ?? false}
                  onCheckedChange={handleEnforceMfaToggle}
                  disabled={!isAllowed}
                  aria-label="Toggle MFA enforcement"
                />
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        {currentOrg?.enforceMfa && (
          <CardContent className="max-w-md px-6 pb-6">
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
          </CardContent>
        )}
        <CardFooter className="min-h-8 border-t border-neutral/15 bg-neutral/5 p-4 pl-6">
          <p className="text-sm text-muted">
            {currentOrg?.enforceMfa
              ? "MFA is enforced. Members must complete a second authentication factor to sign in."
              : "MFA is not enforced. Members choose whether to set up a second factor."}
          </p>
        </CardFooter>
      </Card>
      <UpgradeGate
        paywallKey="organization.org-generic-auth"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        intent={{
          ...MfaEnforcementUpgradeIntent,
          isEnterpriseFeature: false
        }}
      />
    </>
  );
};
