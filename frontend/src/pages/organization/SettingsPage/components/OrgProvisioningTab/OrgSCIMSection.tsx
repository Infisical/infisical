import { UserCog } from "lucide-react";

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
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
  Separator,
  Switch
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { ExternalGroupOrgRoleMappings } from "./ExternalGroupOrgRoleMappings";
import { ScimTokenModal } from "./ScimTokenModal";

export const OrgScimSection = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "scimToken",
    "deleteScimToken",
    "upgradePlan"
  ] as const);

  const { mutateAsync } = useUpdateOrg();

  const addScimTokenBtnClick = () => {
    if (subscription?.scim) {
      handlePopUpOpen("scimToken");
    } else {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true
      });
    }
  };

  const handleEnableSCIMToggle = async (value: boolean) => {
    if (!currentOrg?.id) return;
    if (!subscription?.scim) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true
      });
      return;
    }

    await mutateAsync({
      orgId: currentOrg?.id,
      scimEnabled: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} SCIM provisioning`,
      type: "success"
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <UserCog className="size-4 text-accent" />
            SCIM Provisioning
          </CardTitle>
          <CardDescription>Manage SCIM configuration for member provisioning.</CardDescription>
          <CardAction>
            <OrgPermissionCan I={OrgPermissionActions.Read} a={OrgPermissionSubjects.Scim}>
              {(isAllowed) => (
                <Button variant="outline" isDisabled={!isAllowed} onClick={addScimTokenBtnClick}>
                  Configure
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Enable SCIM</FieldTitle>
                <FieldDescription>
                  Allow member provisioning/deprovisioning with SCIM.
                </FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Scim}>
                {(isAllowed) => (
                  <Switch
                    id="enable-scim"
                    variant="org"
                    checked={currentOrg?.scimEnabled ?? false}
                    onCheckedChange={handleEnableSCIMToggle}
                    disabled={!isAllowed}
                  />
                )}
              </OrgPermissionCan>
            </Field>
          </FieldGroup>
          <Separator className="my-4" />
          <ExternalGroupOrgRoleMappings />
        </CardContent>
      </Card>
      <ScimTokenModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to SCIM Provisioning. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
