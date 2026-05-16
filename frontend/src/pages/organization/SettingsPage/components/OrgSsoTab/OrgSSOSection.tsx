import { AlertTriangle, ArrowLeftRight, Info, MoreHorizontal, Pencil } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
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
  IconButton,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useCreateSSOConfig, useGetSSOConfig, useUpdateSSOConfig } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { SSOModal } from "./SSOModal";

const GROUP_SYNC_SUPPORTED_PROVIDERS = ["google-saml"] as const;

type Props = {
  onSwitchProvider?: () => void;
};

export const OrgSSOSection = ({ onSwitchProvider }: Props): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();

  const { data, isPending } = useGetSSOConfig(currentOrg?.id ?? "");
  const { mutateAsync } = useUpdateSSOConfig();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "upgradePlan",
    "addSSO"
  ] as const);

  const { mutateAsync: createMutateAsync } = useCreateSSOConfig();

  const handleSamlSSOToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;

    if (!subscription?.samlSSO) {
      handlePopUpOpen("upgradePlan", {
        text: "Your current plan does not include access to SAML SSO. To unlock this feature, please upgrade to Infisical Pro plan."
      });
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      isActive: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} SAML SSO`,
      type: "success"
    });
  };

  const handleSamlGroupManagement = async (value: boolean) => {
    if (!currentOrg?.id) return;

    if (!subscription?.samlSSO || !subscription?.groups) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true,
        text: "Your current plan does not include access to SAML group mapping. To unlock this feature, please upgrade to Infisical Enterprise plan."
      });
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      enableGroupSync: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} SAML group membership mapping`,
      type: "success"
    });
  };

  const addSSOBtnClick = async () => {
    try {
      if (subscription?.samlSSO && currentOrg) {
        if (!data) {
          await createMutateAsync({
            organizationId: currentOrg.id,
            authProvider: "okta-saml",
            isActive: false,
            entryPoint: "",
            issuer: "",
            cert: ""
          });
        }

        handlePopUpOpen("addSSO");
      } else {
        handlePopUpOpen("upgradePlan", {
          text: "Your current plan does not include access to SAML SSO. To unlock this feature, please upgrade to Infisical Pro plan."
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isGoogleOAuthEnabled = currentOrg.googleSsoAuthEnforced;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>SAML</CardTitle>
          <CardDescription>Manage SAML authentication configuration.</CardDescription>
          {!isPending && (
            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="ghost" size="sm" aria-label="SAML configuration options">
                    <MoreHorizontal />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Sso}>
                    {(isAllowed) => (
                      <DropdownMenuItem isDisabled={!isAllowed} onClick={addSSOBtnClick}>
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
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Enable SAML</FieldTitle>
                <FieldDescription>
                  Allow members to authenticate into Infisical with SAML.
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
                      ? "You cannot enable SAML SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable SAML SSO."
                      : undefined
                  }
                  renderTooltip={isGoogleOAuthEnabled}
                >
                  {(isAllowed) => (
                    <div>
                      <Switch
                        id="enable-saml-sso"
                        variant="org"
                        checked={data ? data.isActive : false}
                        onCheckedChange={(value) => handleSamlSSOToggle(value)}
                        disabled={!isAllowed || isGoogleOAuthEnabled}
                      />
                    </div>
                  )}
                </OrgPermissionCan>
              )}
            </Field>
            {data && GROUP_SYNC_SUPPORTED_PROVIDERS.includes(data.authProvider) && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>
                    SAML Group Membership Mapping
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-lg">
                        <p>
                          When this feature is enabled, Infisical will automatically sync group
                          memberships between the SAML provider and Infisical. Users will be added
                          to Infisical groups that match their SAML group names.
                        </p>
                        <p className="mt-3">
                          To use this feature you must include group claims in the SAML response as
                          a &quot;groups&quot; attribute.{" "}
                          <a
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 hover:text-foreground"
                            href="https://infisical.com/docs/documentation/platform/sso/overview"
                          >
                            See your SAML provider docs for details.
                          </a>
                        </p>
                        <p className="mt-3 flex items-start gap-1.5 text-warning">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                          <span>
                            Group membership changes in the SAML provider only sync with Infisical
                            when a user logs in via SAML — removing a user from a group in the SAML
                            provider will not be reflected in Infisical until their next SAML login.
                            Enable Enforce SAML SSO to ensure this behavior.
                          </span>
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </FieldTitle>
                  <FieldDescription>
                    Infisical will manage user group memberships based on the SAML provider.
                  </FieldDescription>
                </FieldContent>
                <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                  {(isAllowed) => (
                    <Switch
                      id="enable-saml-group-sync"
                      variant="org"
                      checked={data?.enableGroupSync ?? false}
                      onCheckedChange={(value) => handleSamlGroupManagement(value)}
                      disabled={!isAllowed}
                    />
                  )}
                </OrgPermissionCan>
              </Field>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
      <SSOModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={popUp.upgradePlan.data?.text}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
