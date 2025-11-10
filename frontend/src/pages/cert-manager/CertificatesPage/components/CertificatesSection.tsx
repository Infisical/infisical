import { faArrowRight, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { useDeleteCert, useDownloadCertJks } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { CertificateCertModal } from "./CertificateCertModal";
import { CertificateExportModal, ExportOptions } from "./CertificateExportModal";
import { CertificateImportModal } from "./CertificateImportModal";
import { CertificateIssuanceModal } from "./CertificateIssuanceModal";
import { CertificateManagePkiSyncsModal } from "./CertificateManagePkiSyncsModal";
import { CertificateManageRenewalModal } from "./CertificateManageRenewalModal";
import { CertificateRenewalModal } from "./CertificateRenewalModal";
import { CertificateRevocationModal } from "./CertificateRevocationModal";
import { CertificatesTable } from "./CertificatesTable";

export const CertificatesSection = () => {
  const { currentProject } = useProject();
  const { mutateAsync: deleteCert } = useDeleteCert();
  const { mutateAsync: downloadCertJks } = useDownloadCertJks();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "issueCertificate",
    "certificateImport",
    "certificateCert",
    "certificateExport",
    "deleteCertificate",
    "revokeCertificate",
    "manageRenewal",
    "renewCertificate",
    "managePkiSyncs"
  ] as const);

  const onRemoveCertificateSubmit = async (serialNumber: string) => {
    if (!currentProject?.slug) return;

    await deleteCert({ serialNumber, projectSlug: currentProject.slug });

    createNotification({
      text: "Successfully deleted certificate",
      type: "success"
    });

    handlePopUpClose("deleteCertificate");
  };

  const handleCertificateExport = async (
    format: "pem" | "jks",
    serialNumber: string,
    options?: ExportOptions
  ) => {
    if (format === "pem") {
      handlePopUpOpen("certificateCert", { serialNumber });
    } else if (format === "jks") {
      if (!currentProject?.slug) return;

      if (!options?.jks?.password || !options?.jks?.alias) {
        createNotification({
          text: "Password and alias are required for JKS export",
          type: "error"
        });
        return;
      }

      try {
        await downloadCertJks({
          serialNumber,
          projectSlug: currentProject.slug,
          password: options.jks.password,
          alias: options.jks.alias
        });

        createNotification({
          text: "JKS certificate downloaded successfully",
          type: "success"
        });
      } catch {
        createNotification({
          text: "Failed to download JKS certificate",
          type: "error"
        });
      }
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-medium text-mineshaft-100">Certificates</p>
        <ProjectPermissionCan
          I={ProjectPermissionCertificateActions.Create}
          a={ProjectPermissionSub.Certificates}
        >
          {(isAllowed) => (
            <div className="flex gap-2">
              <Button
                variant="outline_bg"
                leftIcon={<FontAwesomeIcon icon={faArrowRight} />}
                onClick={() => handlePopUpOpen("certificateImport")}
                isDisabled={!isAllowed}
              >
                Import
              </Button>
              <Button
                colorSchema="primary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("issueCertificate")}
                isDisabled={!isAllowed}
              >
                Issue
              </Button>
            </div>
          )}
        </ProjectPermissionCan>
      </div>
      <CertificatesTable handlePopUpOpen={handlePopUpOpen} />
      <CertificateIssuanceModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateImportModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateCertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateExportModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        onFormatSelected={handleCertificateExport}
      />
      <CertificateManageRenewalModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateRenewalModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateRevocationModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateManagePkiSyncsModal
        popUp={popUp.managePkiSyncs}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.deleteCertificate.isOpen}
        title={`Are you sure you want to remove the certificate ${
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
