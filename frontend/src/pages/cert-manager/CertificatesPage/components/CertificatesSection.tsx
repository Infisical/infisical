import { ArrowRightIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  DocumentationLinkBadge,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { useDeleteCert, useDownloadCertPkcs12 } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { CertificateCertModal } from "./CertificateCertModal";
import { CertificateExportModal, ExportOptions } from "./CertificateExportModal";
import { CertificateImportModal } from "./CertificateImportModal";
import { CertificateManagePkiSyncsModal } from "./CertificateManagePkiSyncsModal";
import { CertificateManageRenewalModal } from "./CertificateManageRenewalModal";
import { CertificateRenewalModal } from "./CertificateRenewalModal";
import { CertificateRevocationModal } from "./CertificateRevocationModal";
import { CertificatesTable } from "./CertificatesTable";
import type { FilterRule } from "./inventory-types";

type CertificatesSectionProps = {
  externalFilter?: {
    search?: string;
  };
  dashboardFilters?: FilterRule[];
};

export const CertificatesSection = ({
  externalFilter,
  dashboardFilters
}: CertificatesSectionProps) => {
  const { currentProject } = useProject();
  const { mutateAsync: deleteCert } = useDeleteCert();
  const { mutateAsync: downloadCertPkcs12 } = useDownloadCertPkcs12();

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

  const onRemoveCertificateSubmit = async (id: string) => {
    if (!currentProject?.slug) return;

    await deleteCert({
      id,
      projectId: currentProject.id
    });

    createNotification({
      text: "Successfully deleted certificate",
      type: "success"
    });

    handlePopUpClose("deleteCertificate");
  };

  const handleCertificateExport = async (
    format: "pem" | "pkcs12",
    {
      certificateId,
      serialNumber
    }: {
      certificateId: string;
      serialNumber: string;
    },
    options?: ExportOptions
  ) => {
    if (format === "pem") {
      handlePopUpOpen("certificateCert", { serialNumber });
    } else if (format === "pkcs12") {
      if (!currentProject?.slug) return;

      if (!options?.pkcs12?.password || !options?.pkcs12?.alias) {
        createNotification({
          text: "Password and alias are required for PKCS12 export",
          type: "error"
        });
        return;
      }

      try {
        await downloadCertPkcs12({
          certificateId,
          projectSlug: currentProject.slug,
          password: options.pkcs12.password,
          alias: options.pkcs12.alias
        });

        createNotification({
          text: "PKCS12 certificate downloaded successfully",
          type: "success"
        });
      } catch (error) {
        createNotification({
          text: error instanceof Error ? error.message : "Failed to download PKCS12 certificate",
          type: "error"
        });
      }
    }
  };

  return (
    <UnstableCard className="mb-6">
      <UnstableCardHeader>
        <UnstableCardTitle className="flex items-center gap-x-2">
          Certificates
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pki/certificates/overview" />
        </UnstableCardTitle>
        <UnstableCardDescription>
          View, filter, and manage all certificates across your project.
        </UnstableCardDescription>
        <UnstableCardAction>
          <ProjectPermissionCan
            I={ProjectPermissionCertificateActions.Import}
            a={ProjectPermissionSub.Certificates}
          >
            {(isAllowed) => (
              <Button
                variant="outline"
                onClick={() => handlePopUpOpen("certificateImport")}
                disabled={!isAllowed}
              >
                <ArrowRightIcon className="mr-1.5 size-4" />
                Import
              </Button>
            )}
          </ProjectPermissionCan>
        </UnstableCardAction>
      </UnstableCardHeader>
      <UnstableCardContent>
        <CertificatesTable
          handlePopUpOpen={handlePopUpOpen}
          externalFilter={externalFilter}
          dashboardFilters={dashboardFilters}
        />
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
              (popUp?.deleteCertificate?.data as { certificateId: string })?.certificateId
            )
          }
        />
      </UnstableCardContent>
    </UnstableCard>
  );
};
