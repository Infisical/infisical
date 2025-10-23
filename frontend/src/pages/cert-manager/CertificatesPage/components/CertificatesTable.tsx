import { useMemo, useState } from "react";
import {
  faBan,
  faCertificate,
  faEllipsis,
  faEye,
  faFileExport,
  faQuestionCircle,
  faRedo,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
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
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { useListWorkspaceCertificates, useUpdateRenewalConfig } from "@app/hooks/api";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability, CaType } from "@app/hooks/api/ca/enums";
import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import { TCertificate } from "@app/hooks/api/certificates/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { getCertValidUntilBadgeDetails } from "./CertificatesTable.utils";

const isExpiringWithinOneDay = (notAfter: string): boolean => {
  const expiryDate = new Date(notAfter);
  const now = new Date();
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return expiryDate <= oneDayFromNow;
};

const getAutoRenewalInfo = (certificate: TCertificate) => {
  if (certificate.renewedById) {
    return { text: "Renewed", variant: "success" as const };
  }

  const isRevoked = certificate.status === CertStatus.REVOKED;
  const isExpired = new Date(certificate.notAfter) < new Date();
  const hasNoProfile = !certificate.profileId;
  const isExpiringWithinDay = isExpiringWithinOneDay(certificate.notAfter);

  if (isRevoked || isExpired || hasNoProfile || isExpiringWithinDay) {
    return null;
  }

  if (certificate.renewalError) {
    return {
      text: "Failed",
      variant: "danger" as const,
      tooltip: certificate.renewalError
    };
  }

  if (!certificate.renewBeforeDays) {
    return { text: "Disabled", variant: "primary" as const };
  }

  const notAfterDate = new Date(certificate.notAfter);
  const renewalDate = new Date(
    notAfterDate.getTime() - certificate.renewBeforeDays * 24 * 60 * 60 * 1000
  );
  const now = new Date();

  if (renewalDate <= now) {
    return { text: "Due Now", variant: "danger" as const };
  }

  const daysUntilRenewal = Math.ceil(
    (renewalDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (daysUntilRenewal <= 7) {
    return { text: `Renews in ${daysUntilRenewal}d`, variant: "primary" as const };
  }

  return { text: `Renews in ${daysUntilRenewal}d`, variant: "success" as const };
};

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      [
        "certificate",
        "deleteCertificate",
        "revokeCertificate",
        "certificateCert",
        "manageRenewal",
        "renewCertificate"
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
      renewedFromId?: string;
      renewedById?: string;
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
    try {
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
        disableAutoRenewal: true
      });

      createNotification({
        text: `Auto-renewal disabled for ${commonName}`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to disable auto-renewal. Please try again or contact support if the issue persists.",
        type: "error"
      });
    }
  };

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Common Name</Th>
            <Th>Status</Th>
            <Th>Not Before</Th>
            <Th>Not After</Th>
            <Th>Auto Renewal</Th>
            <Th />
          </Tr>
        </THead>
        <TBody>
          {isPending && <TableSkeleton columns={5} innerKey="project-cas" />}
          {!isPending &&
            data?.certificates.map((certificate) => {
              const { variant, label } = getCertValidUntilBadgeDetails(certificate.notAfter);
              const autoRenewalInfo = getAutoRenewalInfo(certificate);
              return (
                <Tr className="h-10" key={`certificate-${certificate.id}`}>
                  <Td>{certificate.commonName}</Td>
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
                  <Td>
                    {autoRenewalInfo &&
                      (autoRenewalInfo.tooltip ? (
                        <div className="flex items-center gap-2">
                          <Badge variant={autoRenewalInfo.variant}>
                            {autoRenewalInfo.text}
                            <Tooltip content={autoRenewalInfo.tooltip}>
                              <FontAwesomeIcon
                                icon={faQuestionCircle}
                                className="ml-1 cursor-help text-red-400 hover:text-red-300"
                                size="sm"
                              />
                            </Tooltip>
                          </Badge>
                        </div>
                      ) : (
                        <Badge variant={autoRenewalInfo.variant}>{autoRenewalInfo.text}</Badge>
                      ))}
                  </Td>
                  <Td className="flex justify-end">
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
                                handlePopUpOpen("certificateCert", {
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
                                handlePopUpOpen("certificate", {
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
                        {/* Manage auto renewal option - not shown for failed renewals */}
                        {(() => {
                          const isRevoked = certificate.status === CertStatus.REVOKED;
                          const isExpired = new Date(certificate.notAfter) < new Date();
                          const hasFailed = Boolean(certificate.renewalError);
                          const isExpiringWithinDay = isExpiringWithinOneDay(certificate.notAfter);
                          const canManageRenewal =
                            certificate.profileId &&
                            !certificate.renewedById &&
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
                                const isAutoRenewalEnabled = Boolean(
                                  certificate.renewBeforeDays && certificate.renewBeforeDays > 0
                                );

                                return (
                                  <DropdownMenuItem
                                    className={twMerge(
                                      !isAllowed &&
                                        "pointer-events-none cursor-not-allowed opacity-50"
                                    )}
                                    onClick={async () => {
                                      const notAfterDate = new Date(certificate.notAfter);
                                      const notBeforeDate = new Date(certificate.notBefore);
                                      const ttlDays = Math.ceil(
                                        (notAfterDate.getTime() - notBeforeDate.getTime()) /
                                          (24 * 60 * 60 * 1000)
                                      );
                                      handlePopUpOpen("manageRenewal", {
                                        certificateId: certificate.id,
                                        commonName: certificate.commonName,
                                        profileId: certificate.profileId,
                                        renewBeforeDays: certificate.renewBeforeDays,
                                        ttlDays,
                                        notAfter: certificate.notAfter,
                                        renewalError: certificate.renewalError,
                                        renewedFromId: certificate.renewedFromId,
                                        renewedById: certificate.renewedById
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
                          const isRevoked = certificate.status === CertStatus.REVOKED;
                          const isExpired = new Date(certificate.notAfter) < new Date();
                          const isExpiringWithinDay = isExpiringWithinOneDay(certificate.notAfter);
                          const isAutoRenewalEnabled = Boolean(
                            certificate.renewBeforeDays && certificate.renewBeforeDays > 0
                          );
                          const canDisableRenewal =
                            certificate.profileId &&
                            !certificate.renewedById &&
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
                          const isRevoked = certificate.status === CertStatus.REVOKED;
                          const isExpired = new Date(certificate.notAfter) < new Date();
                          const canRenew =
                            certificate.profileId &&
                            !certificate.renewedById &&
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
