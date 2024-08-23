import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useDeleteCert } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { CertificateCertModal } from "./CertificateCertModal";
import { CertificateModal } from "./CertificateModal";
import { CertificateRevocationModal } from "./CertificateRevocationModal";
import { CertificatesTable } from "./CertificatesTable";

export const CertificatesSection = () => {
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync: deleteCert } = useDeleteCert();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "certificate",
    "certificateCert",
    "deleteCertificate",
    "revokeCertificate"
  ] as const);

  const onRemoveCertificateSubmit = async (serialNumber: string) => {
    try {
      if (!currentWorkspace?.slug) return;

      await deleteCert({ serialNumber, projectSlug: currentWorkspace.slug });

      await createNotification({
        text: "Successfully deleted certificate",
        type: "success"
      });

      handlePopUpClose("deleteCertificate");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete certificate",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Certificates</p>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.Certificates}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("certificate")}
              isDisabled={!isAllowed}
            >
              Issue
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <CertificatesTable handlePopUpOpen={handlePopUpOpen} />
      <CertificateModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateCertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateRevocationModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteCertificate.isOpen}
        title={`Are you sure want to remove the certificate ${
          (popUp?.deleteCertificate?.data as { commonName: string })?.commonName || ""
        } from the project?`}
        onChange={(isOpen) => handlePopUpToggle("deleteCertificate", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveCertificateSubmit(
            (popUp?.deleteCertificate?.data as { serialNumber: string })?.serialNumber
          )
        }
      />
    </div>
  );
};
