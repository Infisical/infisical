import { useEffect, useMemo, useState } from "react";
import { subject } from "@casl/ability";
import {
  faBan,
  faCertificate,
  faClockRotateLeft,
  faEllipsis,
  faEye,
  faFileExport,
  faFilter,
  faLink,
  faMagnifyingGlass,
  faRedo,
  faSearch,
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
import { truncateSerialNumber } from "@app/components/utilities/serialNumberUtils";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterableSelect,
  IconButton,
  Input,
  Pagination,
  Select,
  SelectItem,
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
  ProjectPermissionPkiSyncActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { useUpdateRenewalConfig } from "@app/hooks/api";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability, CaType } from "@app/hooks/api/ca/enums";
import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { getCertValidUntilBadgeDetails } from "./CertificatesTable.utils";

enum CertificateStatus {
  Active = "active",
  Expired = "expired",
  Revoked = "revoked"
}

type CertificateFilters = {
  status?: CertificateStatus;
};

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
  externalFilter?: {
    certificateId?: string;
    search?: string;
  };
};

const PER_PAGE_INIT = 25;

export const CertificatesTable = ({ handlePopUpOpen, externalFilter }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);
  const [pendingSearch, setPendingSearch] = useState(externalFilter?.search || "");
  const [pendingProfileIds, setPendingProfileIds] = useState<string[]>([]);
  const [pendingFilters, setPendingFilters] = useState<CertificateFilters>({});

  const [appliedSearch, setAppliedSearch] = useState(externalFilter?.search || "");
  const [appliedProfileIds, setAppliedProfileIds] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<CertificateFilters>({});

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setAppliedSearch(pendingSearch);
      setPage(1);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [pendingSearch]);

  const { currentProject } = useProject();
  const { permission } = useProjectPermission();

  const { data: profilesData } = useListCertificateProfiles({
    projectId: currentProject?.id ?? "",
    limit: 100
  });

  const backendStatus = appliedFilters.status ? [appliedFilters.status] : undefined;

  const profileIds = useMemo(() => {
    if (!appliedProfileIds.length) return undefined;
    return appliedProfileIds;
  }, [appliedProfileIds]);

  const { data, isPending } = useListWorkspaceCertificates({
    projectId: currentProject?.id ?? "",
    offset: (page - 1) * perPage,
    limit: perPage,
    search: appliedSearch.trim() || undefined,
    status: backendStatus,
    ...(profileIds && { profileIds })
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

  const certificates = data?.certificates || [];

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

  const handleClearFilters = () => {
    setPendingSearch("");
    setPendingFilters({});
    setPendingProfileIds([]);
    setAppliedSearch("");
    setAppliedFilters({});
    setAppliedProfileIds([]);
    setPage(1);
  };

  const handleClearStatus = () => {
    setPendingFilters((prev) => ({ ...prev, status: undefined }));
  };

  const handleClearProfiles = () => {
    setPendingProfileIds([]);
  };

  const isTableFiltered = Boolean(appliedFilters.status || appliedProfileIds.length);

  const hasFilterChanges = useMemo(() => {
    const pendingStatus = pendingFilters.status ?? undefined;
    const appliedStatus = appliedFilters.status ?? undefined;
    const statusChanged = pendingStatus !== appliedStatus;
    const profileIdsChanged =
      JSON.stringify([...pendingProfileIds].sort()) !==
      JSON.stringify([...appliedProfileIds].sort());
    return statusChanged || profileIdsChanged;
  }, [pendingFilters.status, appliedFilters.status, pendingProfileIds, appliedProfileIds]);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Input
          value={pendingSearch}
          onChange={(e) => setPendingSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search by SAN, CN, ID or Serial Number"
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter Certificates"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            sideOffset={2}
            className="max-h-[70vh] thin-scrollbar w-80 overflow-y-auto p-4"
            align="end"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-mineshaft-100">Filters</h3>
                <span className="text-xs text-bunker-300">
                  {isTableFiltered && (
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="cursor-pointer text-primary hover:text-primary-600"
                    >
                      Clear filters
                    </button>
                  )}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-bunker-300 uppercase">
                    Certificate Profiles
                  </span>
                  {pendingProfileIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearProfiles}
                      className="cursor-pointer text-xs text-primary hover:text-primary-600"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <FilterableSelect
                  value={pendingProfileIds.map((id) => ({
                    value: id,
                    label: profilesData?.certificateProfiles?.find((p) => p.id === id)?.slug || id
                  }))}
                  onChange={(selectedOptions) => {
                    const ids = Array.isArray(selectedOptions)
                      ? selectedOptions.map((opt) => opt.value)
                      : [];
                    setPendingProfileIds(ids);
                  }}
                  options={
                    profilesData?.certificateProfiles?.map((profile) => ({
                      value: profile.id,
                      label: profile.slug
                    })) || []
                  }
                  placeholder="Select certificate profiles..."
                  className="w-full border-mineshaft-600 bg-mineshaft-700 text-bunker-200"
                  isMulti
                  isLoading={!profilesData}
                  maxMenuHeight={120}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-bunker-300 uppercase">Status</span>
                  {pendingFilters.status && (
                    <button
                      type="button"
                      onClick={handleClearStatus}
                      className="cursor-pointer text-xs text-primary hover:text-primary-600"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <Select
                  value={pendingFilters.status || "all"}
                  onValueChange={(value: string) => {
                    setPendingFilters((prev) => ({
                      ...prev,
                      status: value === "all" ? undefined : (value as CertificateStatus)
                    }));
                  }}
                  placeholder="All statuses"
                  className="w-full border-mineshaft-600 bg-mineshaft-700 text-bunker-200"
                  position="popper"
                  dropdownContainerClassName="max-w-none"
                >
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value={CertificateStatus.Active}>Active</SelectItem>
                  <SelectItem value={CertificateStatus.Expired}>Expired</SelectItem>
                  <SelectItem value={CertificateStatus.Revoked}>Revoked</SelectItem>
                </Select>
              </div>

              <div className="pt-2">
                <Button
                  onClick={() => {
                    setAppliedFilters(pendingFilters);
                    setAppliedProfileIds(pendingProfileIds);
                    setPage(1);
                  }}
                  className="w-full bg-primary font-medium text-black hover:bg-primary-600"
                  size="sm"
                  isDisabled={!hasFilterChanges}
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/3">SAN / CN</Th>
              <Th className="w-1/6">Serial Number</Th>
              <Th className="w-1/6">Status</Th>
              <Th className="w-1/6">Issued At</Th>
              <Th className="w-1/4">Expiring At</Th>
              <Th className="w-12" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={5} innerKey="project-cas" />}
            {!isPending &&
              certificates.map((certificate) => {
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

                const { originalDisplayName } = getCertificateDisplayName(certificate, 64, "—");

                return (
                  <Tr className="group h-10" key={`certificate-${certificate.id}`}>
                    <Td className="max-w-0">
                      <CertificateDisplayName cert={certificate} maxLength={64} fallback="—" />
                    </Td>
                    <Td>
                      <div className="max-w-xs truncate" title={certificate.serialNumber || "N/A"}>
                        {truncateSerialNumber(certificate.serialNumber)}
                      </div>
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
                        {canShowAutoRenewalIcon &&
                          (() => {
                            const canEditCertificate = permission.can(
                              ProjectPermissionCertificateActions.Edit,
                              subject(ProjectPermissionSub.Certificates, {
                                commonName: certificate.commonName,
                                altNames: certificate.altNames,
                                serialNumber: certificate.serialNumber
                              })
                            );

                            return (
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
                                    if (!canEditCertificate) return;
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
                                      ),
                                      notAfter: certificate.notAfter,
                                      renewalError: certificate.renewalError,
                                      renewedFromCertificateId:
                                        certificate.renewedFromCertificateId,
                                      renewedByCertificateId: certificate.renewedByCertificateId
                                    });
                                  }}
                                >
                                  <FontAwesomeIcon icon={faClockRotateLeft} />
                                </button>
                              </Tooltip>
                            );
                          })()}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <IconButton
                            variant="plain"
                            ariaLabel="More options"
                            className="h-max bg-transparent p-0"
                          >
                            <FontAwesomeIcon size="lg" icon={faEllipsis} />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="p-1">
                          <ProjectPermissionCan
                            I={ProjectPermissionCertificateActions.Read}
                            a={subject(ProjectPermissionSub.Certificates, {
                              commonName: certificate.commonName,
                              altNames: certificate.altNames,
                              serialNumber: certificate.serialNumber,
                              friendlyName: certificate.friendlyName
                            })}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={async () =>
                                  handlePopUpOpen("certificateExport", {
                                    certificateId: certificate.id,
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
                              a={subject(ProjectPermissionSub.Certificates, {
                                commonName: certificate.commonName,
                                altNames: certificate.altNames,
                                serialNumber: certificate.serialNumber,
                                friendlyName: certificate.friendlyName
                              })}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
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
                                a={subject(ProjectPermissionSub.Certificates, {
                                  commonName: certificate.commonName,
                                  altNames: certificate.altNames,
                                  serialNumber: certificate.serialNumber,
                                  friendlyName: certificate.friendlyName
                                })}
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
                                a={subject(ProjectPermissionSub.Certificates, {
                                  commonName: certificate.commonName,
                                  altNames: certificate.altNames,
                                  serialNumber: certificate.serialNumber,
                                  friendlyName: certificate.friendlyName
                                })}
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
                                a={subject(ProjectPermissionSub.Certificates, {
                                  commonName: certificate.commonName,
                                  altNames: certificate.altNames,
                                  serialNumber: certificate.serialNumber,
                                  friendlyName: certificate.friendlyName
                                })}
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
                          {certificate.status === CertStatus.ACTIVE &&
                            !certificate.renewedByCertificateId && (
                              <ProjectPermissionCan
                                I={ProjectPermissionPkiSyncActions.Edit}
                                a={ProjectPermissionSub.PkiSyncs}
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
                          {(() => {
                            const caType = caCapabilityMap[certificate.caId];
                            const supportsRevocation =
                              !caType ||
                              caSupportsCapability(caType, CaCapability.REVOKE_CERTIFICATES);

                            if (!supportsRevocation || isRevoked) {
                              return null;
                            }

                            return (
                              <ProjectPermissionCan
                                I={ProjectPermissionCertificateActions.Delete}
                                a={subject(ProjectPermissionSub.Certificates, {
                                  commonName: certificate.commonName,
                                  altNames: certificate.altNames,
                                  serialNumber: certificate.serialNumber,
                                  friendlyName: certificate.friendlyName
                                })}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    className={twMerge(
                                      !isAllowed &&
                                        "pointer-events-none cursor-not-allowed opacity-50"
                                    )}
                                    onClick={async () =>
                                      handlePopUpOpen("revokeCertificate", {
                                        certificateId: certificate.id
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
                            a={subject(ProjectPermissionSub.Certificates, {
                              commonName: certificate.commonName,
                              altNames: certificate.altNames,
                              serialNumber: certificate.serialNumber,
                              friendlyName: certificate.friendlyName
                            })}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={async () =>
                                  handlePopUpOpen("deleteCertificate", {
                                    certificateId: certificate.id,
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
        {!isPending && (data?.totalCount || 0) >= PER_PAGE_INIT && (
          <Pagination
            count={data?.totalCount || 0}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
          />
        )}
        {!isPending && !certificates.length && (
          <EmptyState
            title={
              data?.certificates?.length
                ? "No certificates match search..."
                : "No certificates have been issued"
            }
            icon={data?.certificates?.length ? faSearch : faCertificate}
          />
        )}
      </TableContainer>
    </div>
  );
};
