import { PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge
} from "@app/components/v3";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { OrgPermissionMachineIdentityAuthTemplateActions } from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { useDeleteOrgIdentity } from "@app/hooks/api";
import { useDeleteIdentityAuthTemplate } from "@app/hooks/api/identityAuthTemplates";
import { SubscriptionPlanTypes } from "@app/hooks/api/subscriptions/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { CreateOrgIdentitySheet } from "./CreateOrgIdentitySheet";
import { IdentityAuthTemplateModal } from "./IdentityAuthTemplateModal";
import { IdentityAuthTemplatesTable } from "./IdentityAuthTemplatesTable";
import { IdentityTable } from "./IdentityTable";
import { IdentityTokenAuthTokenModal } from "./IdentityTokenAuthTokenModal";
import { MachineAuthTemplateUsagesModal } from "./MachineAuthTemplateUsagesModal";

export const IdentitySection = withPermission(
  () => {
    const { subscription } = useSubscription();
    const { currentOrg, isSubOrganization } = useOrganization();
    const orgId = currentOrg?.id || "";

    const { mutateAsync: deleteMutateAsync } = useDeleteOrgIdentity();
    const { mutateAsync: deleteTemplateMutateAsync } = useDeleteIdentityAuthTemplate();
    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "identity",
      "identityAuthMethod",
      "deleteIdentity",
      "universalAuthClientSecret",
      "deleteUniversalAuthClientSecret",
      "upgradePlan",
      "tokenAuthToken",
      "createTemplate",
      "editTemplate",
      "deleteTemplate",
      "viewUsages",
      "addOptions"
    ] as const);

    const isMoreIdentitiesAllowed = subscription?.identityLimit
      ? subscription.identitiesUsed < subscription.identityLimit
      : true;

    const isEnterprise = subscription?.slug === SubscriptionPlanTypes.Enterprise;

    const onDeleteIdentitySubmit = async (identityId: string) => {
      await deleteMutateAsync({
        identityId,
        orgId
      });

      createNotification({
        text: "Successfully deleted machine identity",
        type: "success"
      });

      handlePopUpClose("deleteIdentity");
    };

    const onDeleteTemplateSubmit = async (templateId: string) => {
      await deleteTemplateMutateAsync({
        templateId,
        organizationId: orgId
      });

      createNotification({
        text: "Successfully deleted template",
        type: "success"
      });

      handlePopUpClose("deleteTemplate");
    };

    return (
      <>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {isSubOrganization ? "Sub-Organization " : ""}Machine Identities
                <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/machine-identities" />
              </CardTitle>
              <CardDescription>
                All machine identities across your{" "}
                {isSubOrganization ? "sub-organization" : "organization"}, including those scoped to
                individual projects.
              </CardDescription>
              <CardAction>
                <OrgPermissionCan
                  I={OrgPermissionIdentityActions.Create}
                  a={OrgPermissionSubjects.Identity}
                >
                  {(isAllowed) => (
                    <Button
                      variant={isSubOrganization ? "sub-org" : "org"}
                      onClick={() => {
                        if (!isMoreIdentitiesAllowed && !isEnterprise) {
                          handlePopUpOpen("upgradePlan", {
                            description:
                              "You can add more machine identities if you upgrade your Infisical Pro plan."
                          });
                          return;
                        }

                        handlePopUpOpen("identity");
                      }}
                      isDisabled={!isAllowed}
                    >
                      <PlusIcon />
                      {isSubOrganization
                        ? "Add Machine Identity to Sub-Organization"
                        : "Create Organization Machine Identity"}
                    </Button>
                  )}
                </OrgPermissionCan>
              </CardAction>
            </CardHeader>
            <CardContent>
              <IdentityTable handlePopUpOpen={handlePopUpOpen} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                Machine Identity Auth Templates
                <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/auth-templates" />
              </CardTitle>
              <CardDescription>
                Create and manage machine identity authentication templates
              </CardDescription>
              <CardAction>
                <OrgPermissionCan
                  I={OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates}
                  a={OrgPermissionSubjects.MachineIdentityAuthTemplate}
                >
                  {(isAllowed) => (
                    <Button
                      variant={isSubOrganization ? "sub-org" : "org"}
                      onClick={() => {
                        if (subscription && !subscription.machineIdentityAuthTemplates) {
                          handlePopUpOpen("upgradePlan", {
                            isEnterpriseFeature: true,
                            text: "Your current plan does not include access to creating Machine Identity Auth Templates. To unlock this feature, please upgrade to Infisical Enterprise plan."
                          });
                          return;
                        }
                        handlePopUpOpen("createTemplate");
                      }}
                      isDisabled={!isAllowed}
                    >
                      <PlusIcon />
                      Create Template
                    </Button>
                  )}
                </OrgPermissionCan>
              </CardAction>
            </CardHeader>
            <CardContent>
              <IdentityAuthTemplatesTable handlePopUpOpen={handlePopUpOpen} />
            </CardContent>
          </Card>
        </div>
        <IdentityAuthTemplateModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        <MachineAuthTemplateUsagesModal
          isOpen={popUp.viewUsages.isOpen}
          onClose={() => handlePopUpClose("viewUsages")}
          templateId={
            (popUp?.viewUsages?.data as { template: { id: string; name: string } })?.template?.id ||
            ""
          }
          templateName={
            (popUp?.viewUsages?.data as { template: { id: string; name: string } })?.template
              ?.name || ""
          }
        />
        <IdentityTokenAuthTokenModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        <CreateOrgIdentitySheet
          isOpen={popUp.identity.isOpen}
          onOpenChange={(open) => handlePopUpToggle("identity", open)}
        />
        <DeleteActionModal
          isOpen={popUp.deleteIdentity.isOpen}
          title={`Are you sure you want to delete ${
            (popUp?.deleteIdentity?.data as { name: string })?.name || ""
          }?`}
          onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() =>
            onDeleteIdentitySubmit(
              (popUp?.deleteIdentity?.data as { identityId: string })?.identityId
            )
          }
        />
        <DeleteActionModal
          isOpen={popUp.deleteTemplate.isOpen}
          title={`Are you sure you want to delete ${
            (popUp?.deleteTemplate?.data as { name: string })?.name || ""
          }?`}
          onChange={(isOpen) => handlePopUpToggle("deleteTemplate", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() =>
            onDeleteTemplateSubmit(
              (popUp?.deleteTemplate?.data as { templateId: string })?.templateId
            )
          }
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={popUp.upgradePlan.data?.text}
          isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
        />
      </>
    );
  },
  { action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity }
);
