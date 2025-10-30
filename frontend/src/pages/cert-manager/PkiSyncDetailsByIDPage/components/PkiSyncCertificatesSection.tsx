import { useState } from "react";
import { subject } from "@casl/ability";
import { faCertificate, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { CertificateManagementModal } from "@app/components/pki-syncs/CertificateManagementModal";
import {
  CertificateDisplayName,
  getCertificateDisplayName
} from "@app/components/utilities/certificateDisplayUtils";
import {
  DeleteActionModal,
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
import { Badge } from "@app/components/v3";
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
  if (status === CertificateSyncStatus.Syncing) return "neutral";
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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [certificateToDelete, setCertificateToDelete] = useState<{
    id: string;
    displayName: string;
  } | null>(null);
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

      setIsDeleteModalOpen(false);
      setCertificateToDelete(null);
    } catch {
      createNotification({
        text: "Failed to remove certificate from sync",
        type: "error"
      });
    }
  };

  const handleDeleteClick = (certificateId: string, displayName: string) => {
    setCertificateToDelete({ id: certificateId, displayName });
    setIsDeleteModalOpen(true);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="text-lg font-medium text-mineshaft-100">Certificates</h3>
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
          <div className="space-y-4">
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-1/3">SAN / CN</Th>
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

                    const { originalDisplayName } = getCertificateDisplayName(
                      {
                        altNames: syncCert.certificateAltNames,
                        commonName: syncCert.certificateCommonName
                      },
                      34,
                      "Unknown"
                    );

                    return (
                      <Tr key={syncCert.id}>
                        <Td className="max-w-0">
                          <CertificateDisplayName
                            cert={{
                              altNames: syncCert.certificateAltNames,
                              commonName: syncCert.certificateCommonName
                            }}
                            maxLength={34}
                            fallback="Unknown"
                          />
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
                                onClick={() =>
                                  handleDeleteClick(syncCert.certificateId, originalDisplayName)
                                }
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
              {syncCertificates.length === 0 && (
                <EmptyState
                  title="No certificates are part of this certificate sync"
                  icon={faCertificate}
                />
              )}
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

      <DeleteActionModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setCertificateToDelete(null);
        }}
        title="Remove Certificate from Sync"
        subTitle={`Are you sure you want to remove "${certificateToDelete?.displayName}" from this PKI sync?`}
        deleteKey="confirm"
        onDeleteApproved={async () => {
          if (certificateToDelete) {
            await handleRemoveCertificate(certificateToDelete.id);
          }
        }}
        buttonText="Remove Certificate"
      />
    </div>
  );
};
