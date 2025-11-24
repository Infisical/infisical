import { useMemo, useState } from "react";
import {
  faBan,
  faCertificate,
  faClockRotateLeft,
  faEllipsis,
  faEye,
  faFileExport,
  faLink,
  faRedo,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  CertificateDisplayName,
  getCertificateDisplayName
} from "@app/components/utilities/certificateDisplayUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { useUpdateRenewalConfig } from "@app/hooks/api";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability, CaType } from "@app/hooks/api/ca/enums";
import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { getCertValidUntilBadgeDetails } from "./CertificatesTable.utils";

const isExpiringWithinOneDay = (notAfter: string): boolean => {
  const expiryDate = new Date(notAfter);
  const now = new Date();
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return expiryDate <= oneDayFromNow;
};

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      [
        "issueCertificate",
        "deleteCertificate",
        "revokeCertificate",
        "certificateCert",
        "certificateExport",
        "manageRenewal",
        "renewCertificate",
        "managePkiSyncs"
      ]
    >,
    data?: {
      serialNumber?: string;
      commonName?: string;
      certificateId?: string;
      profileId?: string;
      renewBeforeDays?: number;
      ttlDays?: number;
      notAfter?: string;
      renewalError?: string;
      renewedFromCertificateId?: string;
      renewedByCertificateId?: string;
    }
  ) => void;
};

const PER_PAGE_INIT = 25;

export const CertificatesTable = ({ handlePopUpOpen }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { currentProject } = useProject();
  const { data, isPending } = useListWorkspaceCertificates({
    projectId: currentProject?.id ?? "",
    offset: (page - 1) * perPage,
    limit: perPage
  });

  const { mutateAsync: updateRenewalConfig } = useUpdateRenewalConfig();
  // TODO: Use subscription.pkiLegacyTemplates to block legacy templates creation
  const isLegacyTemplatesEnabled = true;

  const { data: caData } = useListCasByProjectId(currentProject?.id ?? "");

  const caCapabilityMap = useMemo(() => {
    if (!caData) return {};

    const map: Record<string, CaType> = {};
    caData.forEach((ca) => {
      map[ca.id] = ca.type;
    });
    return map;
  }, [caData]);

  const handleDisableAutoRenewal = async (certificateId: string, commonName: string) => {
    if (!currentProject?.slug) {
      createNotification({
        text: "Unable to disable auto-renewal: Project not found. Please refresh the page and try again.",
        type: "error"
      });
      return;
    }

    await updateRenewalConfig({
      certificateId,
      projectSlug: currentProject.slug,
      enableAutoRenewal: false
    });

    createNotification({
      text: `Auto-renewal disabled for ${commonName}`,
      type: "success"
    });
  };

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th className="w-1/2">SAN / CN</Th>
            <Th className="w-1/6">Status</Th>
            <Th className="w-1/6">Not Before</Th>
            <Th className="w-1/6">Not After</Th>
            <Th className="w-12" />
          </Tr>
        </THead>
        <TBody>
          {isPending && <TableSkeleton columns={4} innerKey="project-cas" />}
          {!isPending &&
            data?.certificates.map((certificate) => {
              const { variant, label } = getCertValidUntilBadgeDetails(certificate.notAfter);

              const isRevoked = certificate.status === CertStatus.REVOKED;
              const isExpired = new Date(certificate.notAfter) < new Date();
              const isExpiringWithinDay = isExpiringWithinOneDay(certificate.notAfter);
              const hasFailed = Boolean(certificate.renewalError);
              const isAutoRenewalEnabled = Boolean(
                certificate.renewBeforeDays && certificate.renewBeforeDays > 0
              );

              const canShowAutoRenewalIcon = Boolean(
                certificate.profileId &&
                  certificate.hasPrivateKey !== false &&
                  !certificate.renewedByCertificateId &&
                  !isRevoked &&
                  !isExpired &&
                  !isExpiringWithinDay
              );

              // Still need originalDisplayName for other uses in the component
              const { originalDisplayName } = getCertificateDisplayName(certificate, 64, "—");

              return (
                <Tr className="group h-10" key={`certificate-${certificate.id}`}>
                  <Td className="max-w-0">
                    <CertificateDisplayName cert={certificate} maxLength={64} fallback="—" />
                  </Td>
                  <Td>
                    {certificate.status === CertStatus.REVOKED ? (
                      <Badge variant="danger">Revoked</Badge>
                    ) : (
                      <Badge variant={variant}>{label}</Badge>
                    )}
                  </Td>
                  <Td>
                    {certificate.notBefore
                      ? format(new Date(certificate.notBefore), "yyyy-MM-dd")
                      : "-"}
                  </Td>
                  <Td>
                    {certificate.notAfter
                      ? format(new Date(certificate.notAfter), "yyyy-MM-dd")
                      : "-"}
                  </Td>
                  <Td className="flex items-center justify-end gap-2">
                    <div
                      className={`transition-opacity ${(() => {
                        if (!canShowAutoRenewalIcon) return "";
                        if (isAutoRenewalEnabled) return "opacity-100";
                        return "opacity-0 group-hover:opacity-100";
                      })()}`}
                    >
                      {canShowAutoRenewalIcon && (
                        <Tooltip
                          content={(() => {
                            if (hasFailed && certificate.renewalError) {
                              return `Auto-renewal failed: ${certificate.renewalError}`;
                            }
                            if (isAutoRenewalEnabled) {
                              const expiryDate = new Date(certificate.notAfter);
                              const now = new Date();
                              const daysUntilExpiry = Math.ceil(
                                (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
                              );
                              const daysUntilRenewal = Math.max(
                                0,
                                daysUntilExpiry - (certificate.renewBeforeDays || 0)
                              );
                              return `Auto-renews in ${daysUntilRenewal}d`;
                            }
                            return "Set auto renewal";
                          })()}
                        >
                          <button
                            type="button"
                            className={(() => {
                              if (hasFailed) return "pr-1 text-red-500 hover:text-red-400";
                              return "pr-1 text-primary-500 hover:text-primary-400";
                            })()}
                            aria-label="Certificate auto-renewal"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (hasFailed) return;

                              handlePopUpOpen("manageRenewal", {
                                certificateId: certificate.id,
                                commonName: originalDisplayName,
                                profileId: certificate.profileId || "",
                                renewBeforeDays: certificate.renewBeforeDays || 7,
                                ttlDays: Math.ceil(
                                  (new Date(certificate.notAfter).getTime() -
                                    new Date(certificate.notBefore).getTime()) /
                                    (24 * 60 * 60 * 1000)
                                )
                              });
                            }}
                          >
                            <FontAwesomeIcon icon={faClockRotateLeft} />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild className="rounded-lg">
                        <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                          <Tooltip content="More options">
                            <FontAwesomeIcon size="lg" icon={faEllipsis} />
                          </Tooltip>
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="p-1">
                        <ProjectPermissionCan
                          I={ProjectPermissionCertificateActions.Read}
                          a={ProjectPermissionSub.Certificates}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={async () =>
                                handlePopUpOpen("certificateExport", {
                                  serialNumber: certificate.serialNumber
                                })
                              }
                              disabled={!isAllowed}
                              icon={<FontAwesomeIcon icon={faFileExport} />}
                            >
                              Export Certificate
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        {isLegacyTemplatesEnabled && (
                          <ProjectPermissionCan
                            I={ProjectPermissionCertificateActions.Read}
                            a={ProjectPermissionSub.Certificates}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={async () =>
                                  handlePopUpOpen("issueCertificate", {
                                    serialNumber: certificate.serialNumber
                                  })
                                }
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faEye} />}
                              >
                                View Details
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        )}
                        {/* Manage auto renewal option - not shown for failed renewals */}
                        {(() => {
                          const canManageRenewal =
                            certificate.profileId &&
                            certificate.hasPrivateKey !== false &&
                            !certificate.renewedByCertificateId &&
                            !isRevoked &&
                            !isExpired &&
                            !hasFailed &&
                            !isExpiringWithinDay;

                          if (!canManageRenewal) return null;

                          return (
                            <ProjectPermissionCan
                              I={ProjectPermissionCertificateActions.Edit}
                              a={ProjectPermissionSub.Certificates}
                            >
                              {(isAllowed) => {
                                return (
                                  <DropdownMenuItem
                                    className={twMerge(
                                      !isAllowed &&
                                        "pointer-events-none cursor-not-allowed opacity-50"
                                    )}
                                    onClick={async () => {
                                      const notAfterDate = new Date(certificate.notAfter);
                                      const notBeforeDate = certificate.notBefore
                                        ? new Date(certificate.notBefore)
                                        : new Date(
                                            notAfterDate.getTime() - 365 * 24 * 60 * 60 * 1000
                                          );
                                      const ttlDays = Math.max(
                                        1,
                                        Math.ceil(
                                          (notAfterDate.getTime() - notBeforeDate.getTime()) /
                                            (24 * 60 * 60 * 1000)
                                        )
                                      );
                                      handlePopUpOpen("manageRenewal", {
                                        certificateId: certificate.id,
                                        commonName: certificate.commonName,
                                        profileId: certificate.profileId,
                                        renewBeforeDays: certificate.renewBeforeDays,
                                        ttlDays,
                                        notAfter: certificate.notAfter,
                                        renewalError: certificate.renewalError,
                                        renewedFromCertificateId:
                                          certificate.renewedFromCertificateId,
                                        renewedByCertificateId: certificate.renewedByCertificateId
                                      });
                                    }}
                                    disabled={!isAllowed}
                                    icon={<FontAwesomeIcon icon={faRedo} />}
                                  >
                                    {isAutoRenewalEnabled
                                      ? "Manage auto renewal"
                                      : "Enable auto renewal"}
                                  </DropdownMenuItem>
                                );
                              }}
                            </ProjectPermissionCan>
                          );
                        })()}
                        {/* Disable auto renewal option - only shown when auto renewal is active */}
                        {(() => {
                          const canDisableRenewal =
                            certificate.profileId &&
                            certificate.hasPrivateKey !== false &&
                            !certificate.renewedByCertificateId &&
                            !isRevoked &&
                            !isExpired &&
                            !isExpiringWithinDay &&
                            isAutoRenewalEnabled;

                          if (!canDisableRenewal) return null;

                          return (
                            <ProjectPermissionCan
                              I={ProjectPermissionCertificateActions.Edit}
                              a={ProjectPermissionSub.Certificates}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
                                  onClick={async () => {
                                    await handleDisableAutoRenewal(
                                      certificate.id,
                                      certificate.commonName
                                    );
                                  }}
                                  disabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faBan} />}
                                >
                                  Disable auto renewal
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          );
                        })()}
                        {/* Manual renewal action for profile-issued certificates that are not revoked/expired (including failed ones) */}
                        {(() => {
                          const canRenew =
                            (certificate.profileId || certificate.caId) &&
                            certificate.hasPrivateKey !== false &&
                            !certificate.renewedByCertificateId &&
                            !isRevoked &&
                            !isExpired;

                          if (!canRenew) return null;

                          return (
                            <ProjectPermissionCan
                              I={ProjectPermissionCertificateActions.Edit}
                              a={ProjectPermissionSub.Certificates}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
                                  onClick={async () => {
                                    handlePopUpOpen("renewCertificate", {
                                      certificateId: certificate.id,
                                      commonName: certificate.commonName
                                    });
                                  }}
                                  disabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faRedo} />}
                                >
                                  Renew Now
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          );
                        })()}
                        {/* PKI Sync management - only for active certificates that are not renewed */}
                        {certificate.status === CertStatus.ACTIVE &&
                          !certificate.renewedByCertificateId && (
                            <ProjectPermissionCan
                              I={ProjectPermissionCertificateActions.Edit}
                              a={ProjectPermissionSub.Certificates}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
                                  onClick={async () =>
                                    handlePopUpOpen("managePkiSyncs", {
                                      certificateId: certificate.id,
                                      commonName: certificate.commonName
                                    })
                                  }
                                  disabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faLink} />}
                                >
                                  Manage PKI Syncs
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          )}
                        {/* Only show revoke button if CA supports revocation */}
                        {(() => {
                          const caType = caCapabilityMap[certificate.caId];
                          const supportsRevocation =
                            !caType ||
                            caSupportsCapability(caType, CaCapability.REVOKE_CERTIFICATES);

                          if (!supportsRevocation) {
                            return null;
                          }

                          return (
                            <ProjectPermissionCan
                              I={ProjectPermissionCertificateActions.Delete}
                              a={ProjectPermissionSub.Certificates}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
                                  onClick={async () =>
                                    handlePopUpOpen("revokeCertificate", {
                                      serialNumber: certificate.serialNumber
                                    })
                                  }
                                  disabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faBan} />}
                                >
                                  Revoke Certificate
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          );
                        })()}
                        <ProjectPermissionCan
                          I={ProjectPermissionCertificateActions.Delete}
                          a={ProjectPermissionSub.Certificates}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={async () =>
                                handlePopUpOpen("deleteCertificate", {
                                  serialNumber: certificate.serialNumber,
                                  commonName: certificate.commonName
                                })
                              }
                              disabled={!isAllowed}
                              icon={<FontAwesomeIcon icon={faTrash} />}
                            >
                              Delete Certificate
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </Tr>
              );
            })}
        </TBody>
      </Table>
      {!isPending && data?.totalCount !== undefined && data.totalCount >= PER_PAGE_INIT && (
        <Pagination
          count={data.totalCount}
          page={page}
          perPage={perPage}
          onChangePage={(newPage) => setPage(newPage)}
          onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
        />
      )}
      {!isPending && !data?.certificates?.length && (
        <EmptyState title="No certificates have been issued" icon={faCertificate} />
      )}
    </TableContainer>
  );
};
