import { MfaEnforcementUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionSsoActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";
import { SsoMfaTrust } from "@app/hooks/api/organization/types";
import { usePopUp } from "@app/hooks/usePopUp";

type Props = {
  isSsoActive: boolean;
};

export const SsoMfaTrustField = ({ isSsoActive }: Props) => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);
  const { mutateAsync } = useUpdateOrg();

  const handleToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;
    if (value && !subscription?.enforceMfa) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    await mutateAsync({
      orgId: currentOrg.id,
      ssoMfaTrust: value ? SsoMfaTrust.Signal : SsoMfaTrust.None
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} IdP MFA trust`,
      type: "success"
    });
  };

  return (
    <>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>
            Trust IdP MFA
            {!currentOrg?.enforceMfa && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="shaded">No Effect</Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Applies once Enforce MFA is on under Security. Until then every login is prompted
                  as usual.
                </TooltipContent>
              </Tooltip>
            )}
          </FieldTitle>
          <FieldDescription>
            Skip the Infisical MFA prompt for SAML and OIDC logins that completed MFA at your IdP.
          </FieldDescription>
        </FieldContent>
        <OrgPermissionCan I={OrgPermissionSsoActions.Edit} a={OrgPermissionSubjects.Sso}>
          {(isAllowed) => (
            <Toggle
              id="trust-idp-mfa"
              variant="org"
              checked={currentOrg?.ssoMfaTrust === SsoMfaTrust.Signal}
              onCheckedChange={handleToggle}
              disabled={!isAllowed || !isSsoActive}
            />
          )}
        </OrgPermissionCan>
      </Field>
      <UpgradeGate
        paywallKey="organization.org-sso-mfa"
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
