import { faLink, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
import { useDeleteIdentity } from "@app/hooks/api";
import { useDeleteIdentityAuthTemplate } from "@app/hooks/api/identityAuthTemplates";
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityAuthTemplateModal } from "./IdentityAuthTemplateModal";
import { IdentityAuthTemplatesTable } from "./IdentityAuthTemplatesTable";
import { IdentityLinkForm } from "./IdentityLinkForm";
import { IdentityModal } from "./IdentityModal";
import { IdentityTable } from "./IdentityTable";
import { IdentityTokenAuthTokenModal } from "./IdentityTokenAuthTokenModal";
import { MachineAuthTemplateUsagesModal } from "./MachineAuthTemplateUsagesModal";

export const IdentitySection = withPermission(
  () => {
    const { subscription } = useSubscription();
    const { currentOrg, isSubOrganization } = useOrganization();
    const orgId = currentOrg?.id || "";

    const { mutateAsync: deleteMutateAsync } = useDeleteIdentity();
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
      "linkIdentity"
    ] as const);

    const isMoreIdentitiesAllowed = subscription?.identityLimit
      ? subscription.identitiesUsed < subscription.identityLimit
      : true;

    const isEnterprise = subscription?.slug === "enterprise";

    const onDeleteIdentitySubmit = async (identityId: string) => {
      await deleteMutateAsync({
        identityId,
        organizationId: orgId
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
          <div className="mb-4 flex w-full items-center gap-4">
            <div className="flex flex-1 items-center gap-x-2">
              <p className="text-xl font-medium text-mineshaft-100">Identities</p>
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/machine-identities" />
            </div>
            {isSubOrganization && (
              <OrgPermissionCan
                I={OrgPermissionIdentityActions.Create}
                a={OrgPermissionSubjects.Identity}
              >
                {(isAllowed) => (
                  <Button
                    variant="plain"
                    colorSchema="secondary"
                    leftIcon={<FontAwesomeIcon icon={faLink} />}
                    onClick={() => {
                      handlePopUpOpen("linkIdentity");
                    }}
                    isDisabled={!isAllowed}
                  >
                    Link Identity
                  </Button>
                )}
              </OrgPermissionCan>
            )}
            <OrgPermissionCan
              I={OrgPermissionIdentityActions.Create}
              a={OrgPermissionSubjects.Identity}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => {
                    if (!isMoreIdentitiesAllowed && !isEnterprise) {
                      handlePopUpOpen("upgradePlan", {
                        text: "You have reached the maximum number of identities allowed on your current plan. Upgrade to Infisical Pro plan to add more identities."
                      });
                      return;
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
          <IdentityTable handlePopUpOpen={handlePopUpOpen} />
        </div>
        {/* Identity Auth Templates Section */}
        <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex items-center justify-between">
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
        <IdentityModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
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
        <Modal
          isOpen={popUp.linkIdentity.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("linkIdentity", isOpen)}
        >
          <ModalContent
            title="Assign Existing Identity"
            subTitle="Assign an existing identity from your root organization to the sub organization. The identity will continue to be managed at its original scope."
            bodyClassName="overflow-visible"
          >
            <IdentityLinkForm onClose={() => handlePopUpClose("linkIdentity")} />
          </ModalContent>
        </Modal>
        <IdentityTokenAuthTokenModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
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
