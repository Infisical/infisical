import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
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
import { IdentityModal } from "./IdentityModal";
import { IdentityTable } from "./IdentityTable";
import { IdentityTokenAuthTokenModal } from "./IdentityTokenAuthTokenModal";
import { MachineAuthTemplateUsagesModal } from "./MachineAuthTemplateUsagesModal";

export const IdentitySection = withPermission(
  () => {
    const { subscription } = useSubscription();
    const { currentOrg } = useOrganization();
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
      "viewUsages"
    ] as const);

    const isMoreIdentitiesAllowed = subscription?.identityLimit
      ? subscription.identitiesUsed < subscription.identityLimit
      : true;

    const isEnterprise = subscription?.slug === "enterprise";

    const onDeleteIdentitySubmit = async (identityId: string) => {
      try {
        await deleteMutateAsync({
          identityId,
          organizationId: orgId
        });

        createNotification({
          text: "Successfully deleted identity",
          type: "success"
        });

        handlePopUpClose("deleteIdentity");
      } catch (err) {
        console.error(err);
        const error = err as any;
        const text = error?.response?.data?.message ?? "Failed to delete identity";

        createNotification({
          text,
          type: "error"
        });
      }
    };

    const onDeleteTemplateSubmit = async (templateId: string) => {
      try {
        await deleteTemplateMutateAsync({
          templateId,
          organizationId: orgId
        });

        createNotification({
          text: "Successfully deleted template",
          type: "success"
        });

        handlePopUpClose("deleteTemplate");
      } catch (err) {
        console.error(err);
        const error = err as any;
        const text = error?.response?.data?.message ?? "Failed to delete template";

        createNotification({
          text,
          type: "error"
        });
      }
    };

    return (
      <div>
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <p className="text-xl font-semibold text-mineshaft-100">Identities</p>
              <a
                href="https://infisical.com/docs/documentation/platform/identities/overview"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="ml-1 mt-[0.16rem] inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  <span>Docs</span>
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.07rem] ml-1.5 text-[10px]"
                  />
                </div>
              </a>
            </div>
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
                        description:
                          "You can add more identities if you upgrade your Infisical plan."
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
            <div className="flex items-center gap-1">
              <p className="text-xl font-semibold text-mineshaft-100">Identity Auth Templates</p>
              <a
                href="https://infisical.com/docs/documentation/platform/identities/auth-templates"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="ml-1 mt-[0.16rem] inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  <span>Docs</span>
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.07rem] ml-1.5 text-[10px]"
                  />
                </div>
              </a>
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
                    if (subscription && !subscription.kmip) {
                      handlePopUpOpen("upgradePlan");
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
        {/* <IdentityAuthMethodModal
          popUp={popUp}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        /> */}
        {/* <IdentityUniversalAuthClientSecretModal
          popUp={popUp}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        /> */}
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
          text="You can use Identity Auth Templates if you switch to Infisical's Enterprise plan."
        />
      </div>
    );
  },
  { action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity }
);
