import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, UpgradePlanModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteCertTemplate } from "@app/hooks/api";

import { CertificateTemplateEnrollmentModal } from "./CertificateTemplateEnrollmentModal";
import { CertificateTemplateModal } from "./CertificateTemplateModal";
import { CertificateTemplatesTable } from "./CertificateTemplatesTable";

export const CertificateTemplatesSection = () => {
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

      await createNotification({
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
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Certificate Templates</p>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.CertificateTemplates}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("certificateTemplate")}
              isDisabled={!isAllowed}
            >
              Create
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <CertificateTemplatesTable handlePopUpOpen={handlePopUpOpen} />
      <CertificateTemplateModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
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
