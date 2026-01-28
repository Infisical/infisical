import { Helmet } from "react-helmet";
import { subject } from "@casl/ability";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { getCertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
import { AccessRestrictedBanner, DeleteActionModal, PageHeader } from "@app/components/v2";
import {
  Button,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstablePageLoader
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionPkiSyncActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import {
  useDeleteCert,
  useDownloadCertPkcs12,
  useGetCertificateById,
  useUpdateRenewalConfig
} from "@app/hooks/api";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability } from "@app/hooks/api/ca/enums";
import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { CertificateCertModal } from "../CertificatesPage/components/CertificateCertModal";
import {
  CertificateExportModal,
  ExportOptions
} from "../CertificatesPage/components/CertificateExportModal";
import { CertificateManagePkiSyncsModal } from "../CertificatesPage/components/CertificateManagePkiSyncsModal";
import { CertificateManageRenewalModal } from "../CertificatesPage/components/CertificateManageRenewalModal";
import { CertificateRenewalModal } from "../CertificatesPage/components/CertificateRenewalModal";
import { CertificateRevocationModal } from "../CertificatesPage/components/CertificateRevocationModal";
import { isExpiringWithinOneDay } from "../CertificatesPage/components/CertificatesTable.utils";
import { CertificateDetailsSection, CertificateOverviewSection } from "./components";

const Page = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.CertManager.CertificateDetailsByIDPage.id
  });
  const { certificateId } = params as { certificateId: string };
  const { data: certificateData, isLoading } = useGetCertificateById(certificateId);
  const certificate = certificateData?.certificate;

  const projectId = currentProject?.id || "";

  const { mutateAsync: deleteCert } = useDeleteCert();
  const { mutateAsync: downloadCertPkcs12 } = useDownloadCertPkcs12();
  const { mutateAsync: updateRenewalConfig } = useUpdateRenewalConfig();
  const { data: caData } = useListCasByProjectId(currentProject?.id ?? "");

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteCertificate",
    "revokeCertificate",
    "certificateCert",
    "certificateExport",
    "manageRenewal",
    "renewCertificate",
    "managePkiSyncs"
  ] as const);

  if (isLoading) {
    return <UnstablePageLoader />;
  }

  const onDeleteCertificateSubmit = async () => {
    if (!currentProject?.id || !certificate) return;

    await deleteCert({
      id: certificate.id,
      projectId: currentProject.id
    });

    createNotification({
      text: "Successfully deleted certificate",
      type: "success"
    });

    handlePopUpClose("deleteCertificate");
    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/policies",
      params: {
        orgId: currentOrg.id,
        projectId
      }
    });
  };

  const handleCertificateExport = async (
    format: "pem" | "pkcs12",
    {
      certificateId: certId,
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
          certificateId: certId,
          projectSlug: currentProject.slug,
          password: options.pkcs12.password,
          alias: options.pkcs12.alias
        });

        createNotification({
          text: "PKCS12 certificate downloaded successfully",
          type: "success"
        });
      } catch (error: unknown) {
        createNotification({
          text: error instanceof Error ? error.message : "Failed to download PKCS12 certificate",
          type: "error"
        });
      }
    }
  };

  const displayName = certificate
    ? getCertificateDisplayName(certificate, 64, "Certificate").originalDisplayName
    : "Certificate";

  const isRevoked = certificate?.status === CertStatus.REVOKED;
  const isExpired = certificate ? new Date(certificate.notAfter) < new Date() : false;
  const isExpiringWithinDay = certificate ? isExpiringWithinOneDay(certificate.notAfter) : false;
  const hasFailed = Boolean(certificate?.renewalError);
  const isAutoRenewalEnabled = Boolean(
    certificate?.renewBeforeDays && certificate.renewBeforeDays > 0
  );

  // CA capability check for revocation
  const caType = caData?.find((ca) => ca.id === certificate?.caId)?.type;
  const supportsRevocation =
    !caType || caSupportsCapability(caType, CaCapability.REVOKE_CERTIFICATES);

  const handleDisableAutoRenewal = async () => {
    if (!currentProject?.slug || !certificate) return;

    await updateRenewalConfig({
      certificateId: certificate.id,
      projectSlug: currentProject.slug,
      enableAutoRenewal: false
    });

    createNotification({
      text: `Auto-renewal disabled for ${displayName}`,
      type: "success"
    });
  };

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {certificate && (
        <ProjectPermissionCan
          I={ProjectPermissionCertificateActions.Read}
          a={subject(ProjectPermissionSub.Certificates, {
            commonName: certificate.commonName,
            altNames: certificate.altNames,
            serialNumber: certificate.serialNumber,
            friendlyName: certificate.friendlyName
          })}
        >
          {(isAllowed) =>
            isAllowed ? (
              <div className="mx-auto mb-6 w-full max-w-8xl">
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/policies"
                  params={{
                    orgId: currentOrg.id,
                    projectId
                  }}
                  className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
                >
                  <ChevronLeftIcon size={16} />
                  Certificates
                </Link>
                <PageHeader
                  scope={ProjectType.CertificateManager}
                  description="View certificate details"
                  title={displayName}
                >
                  <UnstableDropdownMenu>
                    <UnstableDropdownMenuTrigger asChild>
                      <Button variant="outline">
                        Options
                        <EllipsisIcon />
                      </Button>
                    </UnstableDropdownMenuTrigger>
                    <UnstableDropdownMenuContent align="end">
                      {/* Export Certificate - always available */}
                      <ProjectPermissionCan
                        I={ProjectPermissionCertificateActions.Read}
                        a={subject(ProjectPermissionSub.Certificates, {
                          commonName: certificate.commonName,
                          altNames: certificate.altNames,
                          serialNumber: certificate.serialNumber,
                          friendlyName: certificate.friendlyName
                        })}
                      >
                        {(canRead) => (
                          <UnstableDropdownMenuItem
                            isDisabled={!canRead}
                            onClick={() =>
                              handlePopUpOpen("certificateExport", {
                                certificateId: certificate.id,
                                serialNumber: certificate.serialNumber
                              })
                            }
                          >
                            Export Certificate
                          </UnstableDropdownMenuItem>
                        )}
                      </ProjectPermissionCan>
                      {/* Enable/Manage auto renewal - conditional */}
                      {certificate.profileId &&
                        certificate.hasPrivateKey !== false &&
                        !certificate.renewedByCertificateId &&
                        !isRevoked &&
                        !isExpired &&
                        !hasFailed &&
                        !isExpiringWithinDay && (
                          <ProjectPermissionCan
                            I={ProjectPermissionCertificateActions.Edit}
                            a={subject(ProjectPermissionSub.Certificates, {
                              commonName: certificate.commonName,
                              altNames: certificate.altNames,
                              serialNumber: certificate.serialNumber,
                              friendlyName: certificate.friendlyName
                            })}
                          >
                            {(canEdit) => (
                              <UnstableDropdownMenuItem
                                isDisabled={!canEdit}
                                onClick={() => {
                                  const notAfterDate = new Date(certificate.notAfter);
                                  const notBeforeDate = certificate.notBefore
                                    ? new Date(certificate.notBefore)
                                    : new Date(notAfterDate.getTime() - 365 * 24 * 60 * 60 * 1000);
                                  const ttlDays = Math.max(
                                    1,
                                    Math.ceil(
                                      (notAfterDate.getTime() - notBeforeDate.getTime()) /
                                        (24 * 60 * 60 * 1000)
                                    )
                                  );
                                  handlePopUpOpen("manageRenewal", {
                                    certificateId: certificate.id,
                                    commonName: displayName,
                                    profileId: certificate.profileId,
                                    renewBeforeDays: certificate.renewBeforeDays,
                                    ttlDays,
                                    notAfter: certificate.notAfter,
                                    renewalError: certificate.renewalError,
                                    renewedFromCertificateId: certificate.renewedFromCertificateId,
                                    renewedByCertificateId: certificate.renewedByCertificateId
                                  });
                                }}
                              >
                                {isAutoRenewalEnabled
                                  ? "Manage Auto-Renewal"
                                  : "Enable Auto-Renewal"}
                              </UnstableDropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        )}
                      {/* Disable auto renewal - conditional */}
                      {certificate.profileId &&
                        certificate.hasPrivateKey !== false &&
                        !certificate.renewedByCertificateId &&
                        !isRevoked &&
                        !isExpired &&
                        !isExpiringWithinDay &&
                        isAutoRenewalEnabled && (
                          <ProjectPermissionCan
                            I={ProjectPermissionCertificateActions.Edit}
                            a={subject(ProjectPermissionSub.Certificates, {
                              commonName: certificate.commonName,
                              altNames: certificate.altNames,
                              serialNumber: certificate.serialNumber,
                              friendlyName: certificate.friendlyName
                            })}
                          >
                            {(canEdit) => (
                              <UnstableDropdownMenuItem
                                isDisabled={!canEdit}
                                onClick={handleDisableAutoRenewal}
                              >
                                Disable Auto-Renewal
                              </UnstableDropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        )}
                      {/* Renew Now - conditional */}
                      {(certificate.profileId || certificate.caId) &&
                        certificate.hasPrivateKey !== false &&
                        !certificate.renewedByCertificateId &&
                        !isRevoked &&
                        !isExpired && (
                          <ProjectPermissionCan
                            I={ProjectPermissionCertificateActions.Edit}
                            a={subject(ProjectPermissionSub.Certificates, {
                              commonName: certificate.commonName,
                              altNames: certificate.altNames,
                              serialNumber: certificate.serialNumber,
                              friendlyName: certificate.friendlyName
                            })}
                          >
                            {(canEdit) => (
                              <UnstableDropdownMenuItem
                                isDisabled={!canEdit}
                                onClick={() =>
                                  handlePopUpOpen("renewCertificate", {
                                    certificateId: certificate.id,
                                    commonName: displayName
                                  })
                                }
                              >
                                Renew Now
                              </UnstableDropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        )}
                      {/* Manage PKI Syncs - conditional */}
                      {certificate.status === CertStatus.ACTIVE &&
                        !certificate.renewedByCertificateId && (
                          <ProjectPermissionCan
                            I={ProjectPermissionPkiSyncActions.Edit}
                            a={ProjectPermissionSub.PkiSyncs}
                          >
                            {(canEditPkiSync) => (
                              <UnstableDropdownMenuItem
                                isDisabled={!canEditPkiSync}
                                onClick={() =>
                                  handlePopUpOpen("managePkiSyncs", {
                                    certificateId: certificate.id,
                                    commonName: displayName
                                  })
                                }
                              >
                                Manage PKI Syncs
                              </UnstableDropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        )}
                      {/* Revoke Certificate - conditional */}
                      {supportsRevocation && !isRevoked && (
                        <ProjectPermissionCan
                          I={ProjectPermissionCertificateActions.Delete}
                          a={subject(ProjectPermissionSub.Certificates, {
                            commonName: certificate.commonName,
                            altNames: certificate.altNames,
                            serialNumber: certificate.serialNumber,
                            friendlyName: certificate.friendlyName
                          })}
                        >
                          {(canRevoke) => (
                            <UnstableDropdownMenuItem
                              isDisabled={!canRevoke}
                              onClick={() =>
                                handlePopUpOpen("revokeCertificate", {
                                  certificateId: certificate.id
                                })
                              }
                            >
                              Revoke Certificate
                            </UnstableDropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                      )}
                      {/* Delete Certificate - always available */}
                      <ProjectPermissionCan
                        I={ProjectPermissionCertificateActions.Delete}
                        a={subject(ProjectPermissionSub.Certificates, {
                          commonName: certificate.commonName,
                          altNames: certificate.altNames,
                          serialNumber: certificate.serialNumber,
                          friendlyName: certificate.friendlyName
                        })}
                      >
                        {(canDelete) => (
                          <UnstableDropdownMenuItem
                            variant="danger"
                            isDisabled={!canDelete}
                            onClick={() => handlePopUpOpen("deleteCertificate")}
                          >
                            Delete Certificate
                          </UnstableDropdownMenuItem>
                        )}
                      </ProjectPermissionCan>
                    </UnstableDropdownMenuContent>
                  </UnstableDropdownMenu>
                </PageHeader>
                <div className="flex flex-col gap-5 lg:flex-row">
                  <CertificateOverviewSection certificateId={certificate.id} />
                  <div className="flex flex-1 flex-col gap-y-5">
                    <CertificateDetailsSection certificateId={certificate.id} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="container mx-auto flex h-full items-center justify-center">
                <AccessRestrictedBanner />
              </div>
            )
          }
        </ProjectPermissionCan>
      )}
      <CertificateCertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateExportModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        onFormatSelected={handleCertificateExport}
      />
      <CertificateRevocationModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateManageRenewalModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateRenewalModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateManagePkiSyncsModal
        popUp={popUp.managePkiSyncs}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.deleteCertificate.isOpen}
        title="Are you sure you want to delete this certificate?"
        subTitle="This action cannot be undone. The certificate will be permanently deleted."
        onChange={(isOpen) => handlePopUpToggle("deleteCertificate", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={onDeleteCertificateSubmit}
      />
    </div>
  );
};

export const CertificateDetailsByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>Certificate Details</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Page />
    </>
  );
};
