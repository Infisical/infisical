import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";
import { LinkIcon, PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, Modal, ModalContent } from "@app/components/v2";
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
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityAuthTemplateModal } from "./IdentityAuthTemplateModal";
import { IdentityAuthTemplatesTable } from "./IdentityAuthTemplatesTable";
import { IdentityTable } from "./IdentityTable";
import { IdentityTokenAuthTokenModal } from "./IdentityTokenAuthTokenModal";
import { MachineAuthTemplateUsagesModal } from "./MachineAuthTemplateUsagesModal";
import { OrgIdentityLinkForm } from "./OrgIdentityLinkForm";
import { OrgIdentityModal } from "./OrgIdentityModal";

enum IdentityWizardSteps {
  SelectAction = "select-action",
  LinkIdentity = "link-identity",
  OrganizationIdentity = "project-identity"
}

export const IdentitySection = withPermission(
  () => {
    const { subscription } = useSubscription();
    const { currentOrg, isSubOrganization } = useOrganization();
    const orgId = currentOrg?.id || "";

    const [wizardStep, setWizardStep] = useState(IdentityWizardSteps.SelectAction);

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

    const isEnterprise = subscription?.slug === "enterprise";

    const onDeleteIdentitySubmit = async (identityId: string) => {
      await deleteMutateAsync({
        identityId,
        orgId
      });

      createNotification({
        text: "Successfully deleted identity",
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
              <p className="text-xl font-medium text-mineshaft-100">Identities</p>
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
                      if (!isMoreIdentitiesAllowed && !isEnterprise) {
                        handlePopUpOpen("upgradePlan", {
                          description:
                            "You can add more identities if you upgrade your Infisical Pro plan."
                        });
                        return;
                      }

                      if (!isSubOrganization) {
                        setWizardStep(IdentityWizardSteps.OrganizationIdentity);
                      }

                      handlePopUpOpen("identity");
                    }}
                    isDisabled={!isAllowed}
                  >
                    Create Identity
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
              <p className="text-xl font-medium text-mineshaft-100">Identity Auth Templates</p>
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/auth-templates" />
            </div>
            <OrgPermissionCan
              I={OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates}
              a={OrgPermissionSubjects.MachineIdentityAuthTemplate}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => {
                    if (subscription && !subscription.machineIdentityAuthTemplates) {
                      handlePopUpOpen("upgradePlan", {
                        isEnterpriseFeature: true,
                        text: "Your current plan does not include access to creating Identity Auth Templates. To unlock this feature, please upgrade to Infisical Enterprise plan."
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
              setWizardStep(IdentityWizardSteps.SelectAction);
            }
          }}
        >
          <ModalContent
            bodyClassName="overflow-visible"
            title="Add Identity"
            subTitle={
              isSubOrganization ? "Create a new identity or assign an existing identity" : undefined
            }
          >
            <AnimatePresence mode="wait">
              {wizardStep === IdentityWizardSteps.SelectAction && (
                <motion.div
                  key="select-type-step"
                  transition={{ duration: 0.1 }}
                  initial={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: -30 }}
                >
                  <div
                    className="cursor-pointer rounded-md border border-mineshaft-600 p-4 transition-all hover:bg-mineshaft-700"
                    role="button"
                    tabIndex={0}
                    onClick={() => setWizardStep(IdentityWizardSteps.OrganizationIdentity)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setWizardStep(IdentityWizardSteps.OrganizationIdentity);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <PlusIcon size="1rem" />
                      <div>Create New Identity</div>
                    </div>
                    <div className="mt-2 text-xs text-mineshaft-300">
                      Create a new machine identity specifically for this sub-organization. This
                      identity will be managed at the sub-organization level.
                    </div>
                  </div>
                  <div
                    className="mt-4 cursor-pointer rounded-md border border-mineshaft-600 p-4 transition-all hover:bg-mineshaft-700"
                    role="button"
                    tabIndex={0}
                    onClick={() => setWizardStep(IdentityWizardSteps.LinkIdentity)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setWizardStep(IdentityWizardSteps.LinkIdentity);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <LinkIcon size="1rem" />
                      <div>Assign Existing Identity</div>
                    </div>
                    <div className="mt-2 text-xs text-mineshaft-300">
                      Assign an existing identity from your parent organization. The identity will
                      continue to be managed at its original scope.
                    </div>
                  </div>
                </motion.div>
              )}
              {wizardStep === IdentityWizardSteps.OrganizationIdentity && (
                <motion.div
                  key="identity-step"
                  transition={{ duration: 0.1 }}
                  initial={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: -30 }}
                >
                  <OrgIdentityModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
                </motion.div>
              )}
              {wizardStep === IdentityWizardSteps.LinkIdentity && (
                <motion.div
                  key="link-step"
                  transition={{ duration: 0.1 }}
                  initial={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: -30 }}
                >
                  <OrgIdentityLinkForm onClose={() => handlePopUpClose("identity")} />
                </motion.div>
              )}
            </AnimatePresence>
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
