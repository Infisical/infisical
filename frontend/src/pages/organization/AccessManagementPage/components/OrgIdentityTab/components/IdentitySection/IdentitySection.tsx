import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { InfoIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, Modal, ModalContent, Tooltip } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
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
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityAuthTemplateModal } from "./IdentityAuthTemplateModal";
import { IdentityAuthTemplatesTable } from "./IdentityAuthTemplatesTable";
import { IdentityTable } from "./IdentityTable";
import { IdentityTokenAuthTokenModal } from "./IdentityTokenAuthTokenModal";
import { MachineAuthTemplateUsagesModal } from "./MachineAuthTemplateUsagesModal";
import { OrgIdentityLinkForm } from "./OrgIdentityLinkForm";
import { OrgIdentityModal } from "./OrgIdentityModal";

enum IdentityWizardSteps {
  CreateIdentity = "create-identity",
  LinkIdentity = "link-identity"
}

export const IdentitySection = withPermission(
  () => {
    const { subscription } = useSubscription();
    const { currentOrg, isSubOrganization } = useOrganization();
    const orgId = currentOrg?.id || "";

    const [wizardStep, setWizardStep] = useState(IdentityWizardSteps.CreateIdentity);

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
      <div>
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-1 items-center gap-x-2">
              <p className="text-xl font-medium text-mineshaft-100">
                {isSubOrganization ? "Sub-" : ""}Organization Machine Identities
              </p>
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/machine-identities" />
            </div>
            <div className="flex items-center">
              <OrgPermissionCan
                I={OrgPermissionIdentityActions.Create}
                a={OrgPermissionSubjects.Identity}
              >
                {(isAllowed) => (
                  <Button
                    variant="outline_bg"
                    type="submit"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() => {
                      if (!isSubOrganization) {
                        setWizardStep(IdentityWizardSteps.CreateIdentity);
                      }

                      handlePopUpOpen("identity");
                    }}
                    isDisabled={!isAllowed}
                  >
                    {isSubOrganization
                      ? "Add Machine Identity to Sub-Organization"
                      : "Create Organization Machine Identity"}
                  </Button>
                )}
              </OrgPermissionCan>
            </div>
          </div>
          <IdentityTable handlePopUpOpen={handlePopUpOpen} />
        </div>
        {/* Identity Auth Templates Section */}
        <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-x-2">
              <p className="text-xl font-medium text-mineshaft-100">
                Machine Identity Auth Templates
              </p>
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/auth-templates" />
            </div>
            <OrgPermissionCan
              I={OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates}
              a={OrgPermissionSubjects.MachineIdentityAuthTemplate}
            >
              {(isAllowed) => (
                <Button
                  variant="outline_bg"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => {
                    if (
                      subscription &&
                      !subscription.get(
                        SubscriptionProductCategory.Platform,
                        "machineIdentityAuthTemplates"
                      )
                    ) {
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
                  Create Template
                </Button>
              )}
            </OrgPermissionCan>
          </div>
          <IdentityAuthTemplatesTable handlePopUpOpen={handlePopUpOpen} />
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
        <Modal
          isOpen={popUp.identity.isOpen}
          onOpenChange={(open) => {
            handlePopUpToggle("identity", open);
            if (!open) {
              setWizardStep(IdentityWizardSteps.CreateIdentity);
            }
          }}
        >
          <ModalContent
            bodyClassName="overflow-visible"
            title={
              isSubOrganization
                ? "Add Machine Identity to Sub-Organization"
                : "Create Organization Machine Identity"
            }
            subTitle={
              isSubOrganization
                ? "Create a new machine identity or assign an existing one"
                : undefined
            }
          >
            {isSubOrganization && (
              <div className="mb-4 flex items-center justify-center gap-x-2">
                <div className="flex w-3/4 gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
                  <Button
                    variant="outline_bg"
                    onClick={() => {
                      setWizardStep(IdentityWizardSteps.CreateIdentity);
                    }}
                    size="xs"
                    className={twMerge(
                      "min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600",
                      wizardStep === IdentityWizardSteps.CreateIdentity
                        ? "bg-mineshaft-500"
                        : "bg-transparent"
                    )}
                  >
                    Create New
                  </Button>
                  <Button
                    variant="outline_bg"
                    onClick={() => {
                      setWizardStep(IdentityWizardSteps.LinkIdentity);
                    }}
                    size="xs"
                    className={twMerge(
                      "min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600",
                      wizardStep === IdentityWizardSteps.LinkIdentity
                        ? "bg-mineshaft-500"
                        : "bg-transparent"
                    )}
                  >
                    Assign Existing
                  </Button>
                </div>
                <Tooltip
                  className="max-w-sm"
                  position="right"
                  align="start"
                  content={
                    <>
                      <p className="mb-2 text-mineshaft-300">
                        You can add machine identities to your sub-organization in one of two ways:
                      </p>
                      <ul className="ml-3.5 flex list-disc flex-col gap-y-4">
                        <li className="text-mineshaft-200">
                          <strong className="font-medium text-mineshaft-100">Create New</strong> -
                          Create a new machine identity specifically for this sub-organization. This
                          machine identity will be managed at the sub-organization level.
                          <p className="mt-2">
                            This method is recommended for autonomous teams that need to manage
                            machine identity authentication.
                          </p>
                        </li>
                        <li>
                          <strong className="font-medium text-mineshaft-100">
                            Assign Existing
                          </strong>{" "}
                          Assign an existing machine identity from your parent organization. The
                          machine identity will continue to be managed at its original scope.
                          <p className="mt-2">
                            This method is recommended for organizations that need to maintain
                            centralized control.
                          </p>
                        </li>
                      </ul>
                    </>
                  }
                >
                  <InfoIcon size={16} className="text-mineshaft-400" />
                </Tooltip>
              </div>
            )}
            {wizardStep === IdentityWizardSteps.CreateIdentity && (
              <OrgIdentityModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
            )}
            {wizardStep === IdentityWizardSteps.LinkIdentity && (
              <OrgIdentityLinkForm onClose={() => handlePopUpClose("identity")} />
            )}
          </ModalContent>
        </Modal>
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
      </div>
    );
  },
  { action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity }
);
