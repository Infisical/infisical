import { useState } from "react";
import { subject } from "@casl/ability";
import { faEdit, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { CertificateManagementModal } from "@app/components/pki-syncs/CertificateManagementModal";
import {
  Badge,
  EmptyState,
  IconButton,
  Pagination,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { useListPkiSyncCertificates, useRemoveCertificatesFromPkiSync } from "@app/hooks/api";
import { CertificateSyncStatus, TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

const getSyncStatusVariant = (status?: CertificateSyncStatus | null) => {
  if (status === CertificateSyncStatus.Succeeded) return "success";
  if (status === CertificateSyncStatus.Failed) return "danger";
  if (status === CertificateSyncStatus.Syncing) return "primary";
  return "project";
};

const getSyncStatusText = (status?: CertificateSyncStatus | null) => {
  if (status === CertificateSyncStatus.Succeeded) return "Synced";
  if (status === CertificateSyncStatus.Failed) return "Failed";
  if (status === CertificateSyncStatus.Syncing) return "Syncing";
  if (status === CertificateSyncStatus.Pending) return "Pending";
  return "Unknown";
};

export const PkiSyncCertificatesSection = ({ pkiSync }: Props) => {
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const { data, refetch: refetchSyncCertificates } = useListPkiSyncCertificates(pkiSync.id, {
    offset: (currentPage - 1) * pageSize,
    limit: pageSize
  });
  const syncCertificates = data?.certificates || [];
  const totalCount = data?.totalCount || 0;
  const removeCertificatesFromSync = useRemoveCertificatesFromPkiSync();

  const permissionSubject = subject(ProjectPermissionSub.PkiSyncs, {
    subscriberId: pkiSync.subscriberId || ""
  });

  const handleRemoveCertificate = async (certificateId: string) => {
    try {
      await removeCertificatesFromSync.mutateAsync({
        pkiSyncId: pkiSync.id,
        certificateIds: [certificateId]
      });

      await refetchSyncCertificates();

      createNotification({
        text: "Certificate removed from sync",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to remove certificate from sync",
        type: "error"
      });
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="font-medium text-mineshaft-100">Certificates ({totalCount})</h3>
          <ProjectPermissionCan I={ProjectPermissionPkiSyncActions.Edit} a={permissionSubject}>
            {(isAllowed) => (
              <IconButton
                variant="plain"
                colorSchema="secondary"
                isDisabled={!isAllowed}
                ariaLabel="Edit certificates"
                onClick={() => setIsManageModalOpen(true)}
              >
                <FontAwesomeIcon icon={faEdit} />
              </IconButton>
            )}
          </ProjectPermissionCan>
        </div>

        <div>
          {syncCertificates.length === 0 ? (
            <EmptyState title="No certificates" icon={faPlus}>
              No certificates are currently synced with this PKI destination.
            </EmptyState>
          ) : (
            <div className="space-y-4">
              <TableContainer>
                <Table>
                  <THead>
                    <Tr>
                      <Th className="w-1/3">Common Name</Th>
                      <Th className="w-1/3">Serial Number</Th>
                      <Th className="w-1/9">Status</Th>
                      <Th className="w-1/9">Expires</Th>
                      <Th className="w-1/9">Actions</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {syncCertificates.map((syncCert) => {
                      const isExpired = syncCert.certificateNotAfter
                        ? new Date(syncCert.certificateNotAfter) < new Date()
                        : false;

                      return (
                        <Tr key={syncCert.id}>
                          <Td className="max-w-0">
                            <div
                              className="truncate"
                              title={syncCert.certificateCommonName || "Unknown"}
                            >
                              {syncCert.certificateCommonName || "Unknown"}
                            </div>
                          </Td>
                          <Td className="max-w-0">
                            <div
                              className="truncate text-xs"
                              title={syncCert.certificateSerialNumber || "Unknown"}
                            >
                              {syncCert.certificateSerialNumber || "Unknown"}
                            </div>
                          </Td>
                          <Td>
                            {syncCert.lastSyncMessage &&
                            syncCert.syncStatus === CertificateSyncStatus.Failed ? (
                              <Tooltip content={syncCert.lastSyncMessage}>
                                <Badge variant="danger">Failed</Badge>
                              </Tooltip>
                            ) : (
                              <Badge variant={getSyncStatusVariant(syncCert.syncStatus)}>
                                {getSyncStatusText(syncCert.syncStatus)}
                              </Badge>
                            )}
                          </Td>
                          <Td>
                            <span
                              className={`text-sm ${isExpired ? "text-red-400" : "text-bunker-300"}`}
                            >
                              {syncCert.certificateNotAfter
                                ? new Date(syncCert.certificateNotAfter).toLocaleDateString()
                                : "Unknown"}
                            </span>
                          </Td>
                          <Td className="flex items-center">
                            <ProjectPermissionCan
                              I={ProjectPermissionPkiSyncActions.Edit}
                              a={permissionSubject}
                            >
                              {(isAllowed) => (
                                <IconButton
                                  size="xs"
                                  variant="plain"
                                  colorSchema="danger"
                                  ariaLabel="Remove certificate"
                                  isDisabled={!isAllowed}
                                  onClick={() => handleRemoveCertificate(syncCert.certificateId)}
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                </IconButton>
                              )}
                            </ProjectPermissionCan>
                          </Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center">
                  <Pagination
                    count={totalCount}
                    page={currentPage}
                    perPage={pageSize}
                    onChangePage={(page: number) => setCurrentPage(page)}
                    onChangePerPage={() => {}}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <CertificateManagementModal
        pkiSync={pkiSync}
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        onCertificatesUpdated={() => {
          refetchSyncCertificates();
        }}
      />
    </div>
  );
};
