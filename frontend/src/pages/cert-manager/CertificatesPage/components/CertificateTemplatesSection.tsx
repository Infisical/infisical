/**
 * TODO (dangtony98): Reevaluate if this component should be in main
 * CertificateTab or under CA page in the future.
 */
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteCertTemplate } from "@app/hooks/api";

import { CertificateTemplateEnrollmentModal } from "./CertificateTemplateEnrollmentModal";
import { CertificateTemplateModal } from "./CertificateTemplateModal";
import { CertificateTemplatesTable } from "./CertificateTemplatesTable";

type Props = {
  caId: string;
};

export const CertificateTemplatesSection = ({ caId }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "certificateTemplate",
    "deleteCertificateTemplate",
    "enrollmentOptions",
    "upgradePlan"
  ] as const);

  const { currentWorkspace } = useWorkspace();
  const { mutateAsync: deleteCertTemplate } = useDeleteCertTemplate();

  const onRemoveCertificateTemplateSubmit = async (id: string) => {
    if (!currentWorkspace?.id) {
      return;
    }

    try {
      await deleteCertTemplate({
        id,
        projectId: currentWorkspace.id
      });

      createNotification({
        text: "Successfully deleted certificate template",
        type: "success"
      });

      handlePopUpClose("deleteCertificateTemplate");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete certificate template",
        type: "error"
      });
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Certificate Templates</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.CertificateTemplates}
        >
          {(isAllowed) => (
            <IconButton
              ariaLabel="copy icon"
              variant="plain"
              className="group relative"
              onClick={() => handlePopUpOpen("certificateTemplate")}
              isDisabled={!isAllowed}
            >
              <FontAwesomeIcon icon={faPlus} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="py-4">
        <CertificateTemplatesTable handlePopUpOpen={handlePopUpOpen} caId={caId} />
      </div>
      <CertificateTemplateModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} caId={caId} />
      <CertificateTemplateEnrollmentModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteCertificateTemplate.isOpen}
        title={`Are you sure want to delete the certificate template ${
          (popUp?.deleteCertificateTemplate?.data as { name: string })?.name || ""
        } from the project?`}
        onChange={(isOpen) => handlePopUpToggle("deleteCertificateTemplate", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveCertificateTemplateSubmit(
            (popUp?.deleteCertificateTemplate?.data as { id: string })?.id
          )
        }
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Managing template enrollment options for EST is only available on Infisical's Enterprise plan."
      />
    </div>
  );
};
