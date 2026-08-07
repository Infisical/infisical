import { AlertTriangle, ArrowLeftRight, Info, MoreHorizontal, Pencil } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Switch
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useGetOIDCConfig } from "@app/hooks/api";
import { useUpdateOIDCConfig } from "@app/hooks/api/oidcConfig/mutations";
import { usePopUp } from "@app/hooks/usePopUp";

import { OIDCModal } from "./OIDCModal";

type Props = {
  onSwitchProvider?: () => void;
};

export const OrgOIDCSection = ({ onSwitchProvider }: Props): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();

  const { data, isPending } = useGetOIDCConfig(currentOrg?.id ?? "");
  const { mutateAsync } = useUpdateOIDCConfig();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addOIDC",
    "upgradePlan"
  ] as const);

  const handleOIDCToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;

    if (!subscription?.oidcSSO) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      isActive: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} OIDC SSO`,
      type: "success"
    });
  };

  const handleOIDCGroupManagement = async (value: boolean) => {
    if (!currentOrg?.id) return;

    if (!subscription?.oidcSSO) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      manageGroupMemberships: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} OIDC group membership mapping`,
      type: "success"
    });
  };

  const addOidcButtonClick = async () => {
    if (subscription?.oidcSSO && currentOrg) {
      handlePopUpOpen("addOIDC");
    } else {
      handlePopUpOpen("upgradePlan");
    }
  };

  const isGoogleOAuthEnabled = currentOrg.googleSsoAuthEnforced;

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>OIDC</CardTitle>
          <CardDescription>Manage OIDC authentication configuration.</CardDescription>
          {!isPending && (
            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="ghost" size="sm" aria-label="OIDC configuration options">
                    <MoreHorizontal />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Sso}>
                    {(isAllowed) => (
                      <DropdownMenuItem isDisabled={!isAllowed} onClick={addOidcButtonClick}>
                        <Pencil />
                        Edit Configuration
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                  {onSwitchProvider && (
                    <DropdownMenuItem onClick={onSwitchProvider}>
                      <ArrowLeftRight />
                      Switch Method
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {data && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Enable OIDC</FieldTitle>
                  <FieldDescription>
                    Allow members to authenticate into Infisical with OIDC.
                  </FieldDescription>
                </FieldContent>
                {!isPending && (
                  <OrgPermissionCan
                    I={OrgPermissionActions.Edit}
                    a={OrgPermissionSubjects.Sso}
                    tooltipProps={{
                      className: "max-w-sm",
                      side: "left"
                    }}
                    allowedLabel={
                      isGoogleOAuthEnabled
                        ? "You cannot enable OIDC SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable OIDC SSO."
                        : undefined
                    }
                    renderTooltip={isGoogleOAuthEnabled}
                  >
                    {(isAllowed) => (
                      <div>
                        <Switch
                          id="enable-oidc-sso"
                          variant="org"
                          checked={data.isActive}
                          onCheckedChange={(value) => handleOIDCToggle(value)}
                          disabled={!isAllowed || isGoogleOAuthEnabled}
                        />
                      </div>
                    )}
                  </OrgPermissionCan>
                )}
              </Field>
            )}
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>
                  OIDC Group Membership Mapping
                  <HoverCard openDelay={150} closeDelay={150}>
                    <HoverCardTrigger asChild>
                      <Info className="text-muted" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-lg">
                      <p>
                        Sync group memberships from your OIDC provider on each sign-in. Users join
                        groups matching their OIDC group names and leave the ones that don&apos;t.
                        Manual group management is disabled while this is on.
                      </p>
                      <p className="mt-3">
                        Requires group claims in the OIDC token.{" "}
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:text-foreground"
                          href="https://infisical.com/docs/documentation/platform/sso/overview"
                        >
                          See your OIDC provider docs for details.
                        </a>
                      </p>
                      <Alert variant="warning" className="mt-3">
                        <AlertTriangle />
                        <AlertTitle>
                          Changes only apply on the user&apos;s next OIDC sign-in.
                        </AlertTitle>
                        <AlertDescription>
                          Enforce OIDC SSO to keep this gap small.
                        </AlertDescription>
                      </Alert>
                    </HoverCardContent>
                  </HoverCard>
                </FieldTitle>
                <FieldDescription>
                  Infisical will manage user group memberships based on the OIDC provider.
                </FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                  <Switch
                    id="enforce-org-auth"
                    variant="org"
                    checked={data?.manageGroupMemberships ?? false}
                    onCheckedChange={(value) => handleOIDCGroupManagement(value)}
                    disabled={!isAllowed}
                  />
                )}
              </OrgPermissionCan>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <OIDCModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to OIDC SSO. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature
      />
    </>
  );
};
