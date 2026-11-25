import { MfaEnforcementUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { MFA_METHOD_LABELS } from "@app/components/mfa/setup";
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
  Combobox,
  Field,
  FieldDescription,
  FieldLabel,
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
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { usePopUp } from "@app/hooks/usePopUp";

type TMfaMethodOption = { value: MfaMethod; label: string };

const MFA_METHOD_OPTIONS: TMfaMethodOption[] = [
  MfaMethod.WEBAUTHN,
  MfaMethod.TOTP,
  MfaMethod.EMAIL
].map((value) => ({ value, label: MFA_METHOD_LABELS[value] }));

export const OrgGenericAuthSection = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const { mutateAsync } = useUpdateOrg();
  const { data: serverDetails } = useFetchServerStatus();

  // Email codes need SMTP, and the backend refuses to enforce a list that allows email without it.
  const isEmailAvailable = serverDetails?.emailConfigured ?? true;

  // An org that never picked a method has no list and enforces email, the same fallback the backend uses.
  const allowedMethods = currentOrg?.allowedMfaMethods?.length
    ? currentOrg.allowedMfaMethods
    : [MfaMethod.EMAIL];
  const selectedOptions = MFA_METHOD_OPTIONS.filter((option) =>
    allowedMethods.includes(option.value)
  );

  const handleEnforceMfaToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;
    if (!subscription?.enforceMfa) {
      handlePopUpOpen("upgradePlan");
      return;
    }
    if (value && !isEmailAvailable && allowedMethods.includes(MfaMethod.EMAIL)) {
      createNotification({
        text: "Remove Email from the allowed methods before enforcing MFA. SMTP isn't configured for this instance.",
        type: "error"
      });
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

  const handleUpdateAllowedMfa = async (options: TMfaMethodOption[]) => {
    // Removing the last MFA method is a no-op.
    if (!currentOrg?.id || !options.length) return;
    if (!subscription?.enforceMfa) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    await mutateAsync({
      orgId: currentOrg?.id,
      allowedMfaMethods: options.map((option) => option.value)
    });

    createNotification({
      text: "Allowed MFA methods updated",
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
        <CardContent className="max-w-lg px-6 pb-6">
          <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
            {(isAllowed) => (
              <Field>
                <FieldLabel htmlFor="org-mfa-methods">Allowed MFA Methods</FieldLabel>
                <Combobox
                  id="org-mfa-methods"
                  multiple
                  isClearable={false}
                  isDisabled={!isAllowed}
                  value={selectedOptions}
                  onValueChange={handleUpdateAllowedMfa}
                  options={MFA_METHOD_OPTIONS}
                  isOptionDisabled={(option) =>
                    option.value === MfaMethod.EMAIL && !isEmailAvailable
                  }
                  getOptionValue={(option) => option.value}
                  getOptionLabel={(option) => option.label}
                  placeholder="Select methods..."
                />
                <FieldDescription>
                  While MFA is enforced, members sign in with their preferred method from this list.
                  {!isEmailAvailable &&
                    " Email isn't available because SMTP isn't configured for this instance."}
                </FieldDescription>
              </Field>
            )}
          </OrgPermissionCan>
        </CardContent>
        <CardFooter className="min-h-8 border-t border-neutral/15 bg-neutral/5 p-4 pl-6">
          <p className="text-sm text-muted">
            {currentOrg?.enforceMfa
              ? "MFA is enforced. Members must sign in with one of the allowed methods."
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
