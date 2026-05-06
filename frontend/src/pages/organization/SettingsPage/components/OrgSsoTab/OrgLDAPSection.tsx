import { ArrowLeftRight, MoreHorizontal, Pencil } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
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
  Switch
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useCreateLDAPConfig, useGetLDAPConfig, useUpdateLDAPConfig } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { LDAPGroupMapModal } from "./LDAPGroupMapModal";
import { LDAPModal } from "./LDAPModal";

type Props = {
  onSwitchProvider?: () => void;
};

export const OrgLDAPSection = ({ onSwitchProvider }: Props): JSX.Element => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();

  const { data } = useGetLDAPConfig(currentOrg?.id ?? "");

  const { mutateAsync } = useUpdateLDAPConfig();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addLDAP",
    "ldapGroupMap",
    "deleteLdapGroupMap",
    "upgradePlan"
  ] as const);

  const { mutateAsync: createMutateAsync } = useCreateLDAPConfig();

  const handleLDAPToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;
    if (!subscription?.ldap) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true
      });
      return;
    }

    await mutateAsync({
      organizationId: currentOrg?.id,
      isActive: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} LDAP`,
      type: "success"
    });
  };

  const addLDAPBtnClick = async () => {
    try {
      if (subscription?.ldap && currentOrg) {
        if (!data) {
          await createMutateAsync({
            organizationId: currentOrg.id,
            isActive: false,
            url: "",
            bindDN: "",
            bindPass: "",
            uniqueUserAttribute: "",
            searchBase: "",
            searchFilter: "",
            groupSearchBase: "",
            groupSearchFilter: ""
          });
        }

        handlePopUpOpen("addLDAP");
      } else {
        handlePopUpOpen("upgradePlan", {
          isEnterpriseFeature: true
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openLDAPGroupMapModal = () => {
    if (!subscription?.ldap) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true
      });
      return;
    }

    handlePopUpOpen("ldapGroupMap");
  };

  const isGoogleOAuthEnabled = currentOrg.googleSsoAuthEnforced;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>LDAP</CardTitle>
          <CardDescription>Manage LDAP authentication configuration.</CardDescription>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton variant="ghost" size="sm" aria-label="LDAP configuration options">
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Ldap}>
                  {(isAllowed) => (
                    <DropdownMenuItem isDisabled={!isAllowed} onClick={addLDAPBtnClick}>
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
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {data && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Enable LDAP</FieldTitle>
                  <FieldDescription>
                    Allow members to authenticate into Infisical with LDAP.
                  </FieldDescription>
                </FieldContent>
                <OrgPermissionCan
                  I={OrgPermissionActions.Edit}
                  a={OrgPermissionSubjects.Ldap}
                  tooltipProps={{
                    className: "max-w-sm",
                    side: "left"
                  }}
                  allowedLabel={
                    isGoogleOAuthEnabled
                      ? "You cannot enable LDAP SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable LDAP SSO."
                      : undefined
                  }
                  renderTooltip={isGoogleOAuthEnabled}
                >
                  {(isAllowed) => (
                    <div>
                      <Switch
                        id="enable-ldap-sso"
                        variant="org"
                        checked={data.isActive}
                        onCheckedChange={(value) => handleLDAPToggle(value)}
                        disabled={!isAllowed || isGoogleOAuthEnabled}
                      />
                    </div>
                  )}
                </OrgPermissionCan>
              </Field>
            )}
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>LDAP Group Mappings</FieldTitle>
                <FieldDescription>
                  Manage how LDAP groups are mapped to internal groups in Infisical.
                </FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Ldap}>
                {(isAllowed) => (
                  <Button variant="outline" isDisabled={!isAllowed} onClick={openLDAPGroupMapModal}>
                    Configure
                  </Button>
                )}
              </OrgPermissionCan>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <LDAPModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <LDAPGroupMapModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to LDAP authentication. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
