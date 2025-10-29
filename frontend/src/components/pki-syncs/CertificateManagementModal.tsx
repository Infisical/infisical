import React, { useEffect, useState } from "react";
import { faSearch, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  ModalContent,
  Pagination,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useProject } from "@app/context";
import {
  CertStatus,
  useAddCertificatesToPkiSync,
  useListPkiSyncCertificates,
  useRemoveCertificatesFromPkiSync
} from "@app/hooks/api";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  pkiSync?: TPkiSync;
  onCertificatesUpdated?: () => void;
  selectedCertificateIds?: string[];
  onCertificateSelectionChange?: (certificateIds: string[]) => void;
  title?: string;
  subtitle?: string;
  saveButtonText?: string;
};

export const CertificateManagementModal = ({
  isOpen,
  onClose,
  pkiSync,
  onCertificatesUpdated,
  selectedCertificateIds,
  onCertificateSelectionChange,
  title = "Manage Certificate Sync",
  subtitle = "Select which certificates should be synced.",
  saveButtonText = "Save Changes"
}: Props) => {
  const { currentProject } = useProject();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const pageSize = 10;

  const isCreateMode = !pkiSync;

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  const { data } = useListWorkspaceCertificates({
    projectId: currentProject?.id || "",
    offset: (currentPage - 1) * pageSize,
    limit: pageSize,
    commonName: debouncedSearchTerm || undefined,
    friendlyName: debouncedSearchTerm || undefined,
    forPkiSync: true
  });

  const allCertificates = data?.certificates || [];
  const totalCount = data?.totalCount || 0;

  const { data: syncData } = useListPkiSyncCertificates(pkiSync?.id || "");
  const syncCertificates = syncData?.certificates || [];
  const addCertificatesToSync = useAddCertificatesToPkiSync();
  const removeCertificatesFromSync = useRemoveCertificatesFromPkiSync();

  const syncedCertificateIds = isCreateMode
    ? selectedCertificateIds || []
    : syncCertificates.map((sc) => sc.certificateId);

  const totalPages = Math.ceil(totalCount / pageSize);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  React.useEffect(() => {
    setSelectedIds(syncedCertificateIds);
  }, [JSON.stringify(syncedCertificateIds)]);

  const handleToggleSelection = (certId: string) => {
    setSelectedIds((prev) =>
      prev.includes(certId) ? prev.filter((id) => id !== certId) : [...prev, certId]
    );
  };

  const handleSelectAll = () => {
    const currentPageIds = allCertificates.map((cert) => cert.id);
    const allCurrentPageSelected = currentPageIds.every((id) => selectedIds.includes(id));

    if (allCurrentPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...currentPageIds])]);
    }
  };

  const clearSearch = () => {
    setSearchTerm("");
    setCurrentPage(1);
  };

  React.useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
      setSearchTerm("");
    }
  }, [isOpen]);

  const handleSaveCertificates = async () => {
    try {
      if (isCreateMode) {
        if (onCertificateSelectionChange) {
          onCertificateSelectionChange(selectedIds);
          onClose();
        }
        return;
      }

      if (!pkiSync) return;

      const certificatesToAdd = selectedIds.filter((id) => !syncedCertificateIds.includes(id));
      const certificatesToRemove = syncedCertificateIds.filter((id) => !selectedIds.includes(id));

      const invalidCertificates = certificatesToAdd
        .map((id) => allCertificates.find((cert) => cert.id === id))
        .filter((cert) => {
          if (!cert) return false;
          const isExpired = new Date(cert.notAfter) < new Date();
          const isRevoked = cert.status === CertStatus.REVOKED;
          return isExpired || isRevoked;
        });

      if (invalidCertificates.length > 0) {
        const invalidNames = invalidCertificates.map((cert) => cert?.commonName).join(", ");
        createNotification({
          text: `Cannot add expired or revoked certificates: ${invalidNames}`,
          type: "error"
        });
        return;
      }

      const operations = [];

      if (certificatesToAdd.length > 0) {
        operations.push(
          addCertificatesToSync
            .mutateAsync({
              pkiSyncId: pkiSync.id,
              certificateIds: certificatesToAdd
            })
            .then(() => ({
              type: "add",
              count: certificatesToAdd.length,
              success: true
            }))
            .catch((error) => ({
              type: "add",
              count: certificatesToAdd.length,
              success: false,
              error
            }))
        );
      }

      if (certificatesToRemove.length > 0) {
        operations.push(
          removeCertificatesFromSync
            .mutateAsync({
              pkiSyncId: pkiSync.id,
              certificateIds: certificatesToRemove
            })
            .then(() => ({
              type: "remove",
              count: certificatesToRemove.length,
              success: true
            }))
            .catch((error) => ({
              type: "remove",
              count: certificatesToRemove.length,
              success: false,
              error
            }))
        );
      }

      if (operations.length === 0) {
        createNotification({
          text: "No changes to save",
          type: "info"
        });
        onClose();
        return;
      }

      const results = await Promise.all(operations);
      const failures = results.filter((r) => !r.success);
      const successes = results.filter((r) => r.success);

      if (failures.length === 0) {
        const addCount = successes.find((r) => r.type === "add")?.count || 0;
        const removeCount = successes.find((r) => r.type === "remove")?.count || 0;

        let message = "Certificate selection updated successfully";
        if (addCount > 0 && removeCount > 0) {
          message = `Added ${addCount} and removed ${removeCount} certificate(s)`;
        } else if (addCount > 0) {
          message = `Added ${addCount} certificate(s)`;
        } else if (removeCount > 0) {
          message = `Removed ${removeCount} certificate(s)`;
        }

        createNotification({
          text: message,
          type: "success"
        });

        if (onCertificatesUpdated) {
          onCertificatesUpdated();
        }
        onClose();
      } else {
        const partialSuccess = successes.length > 0;
        console.error("Certificate sync operation failures:", failures);

        createNotification({
          text: partialSuccess
            ? "Some certificate changes failed. Check console for details."
            : "Failed to update certificate selection",
          type: partialSuccess ? "warning" : "error"
        });

        if (partialSuccess && onCertificatesUpdated) {
          onCertificatesUpdated();
        }
      }
    } catch (error) {
      console.error("Unexpected error during certificate sync operation:", error);
      createNotification({
        text: "An unexpected error occurred while updating certificates",
        type: "error"
      });
    }
  };

  const isLoading = addCertificatesToSync.isPending || removeCertificatesFromSync.isPending;

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent title={title} subTitle={subtitle} className="max-w-4xl">
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="relative">
              <Input
                placeholder="Search by common name, serial number, or SAN..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9"
              />
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute top-1/2 left-3 h-3 w-3 -translate-y-1/2 transform text-bunker-300"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute top-1/2 right-3 -translate-y-1/2 transform text-bunker-300 hover:text-bunker-100"
                >
                  <FontAwesomeIcon icon={faX} className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {allCertificates.length === 0 ? (
            <EmptyState title="No certificates found">
              {searchTerm
                ? "No certificates match your search criteria."
                : "No certificates available for sync."}
            </EmptyState>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <THead>
                    <Tr>
                      <Th className="w-12">
                        <Checkbox
                          id="select-all-certificates"
                          isChecked={
                            allCertificates.length > 0 &&
                            allCertificates.every((cert) => selectedIds.includes(cert.id))
                          }
                          onCheckedChange={handleSelectAll}
                        />
                      </Th>
                      <Th className="w-1/3">Common Name</Th>
                      <Th className="w-1/3">Serial Number</Th>
                      <Th className="w-1/6">Status</Th>
                      <Th className="w-2/6">Expires</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {allCertificates.map((cert) => {
                      const isExpired = new Date(cert.notAfter) < new Date();
                      const isRevoked = cert.status === CertStatus.REVOKED;
                      const cannotBeAdded = isExpired || isRevoked;
                      const isAlreadySynced = syncedCertificateIds.includes(cert.id);

                      return (
                        <Tr
                          key={cert.id}
                          className={`cursor-pointer hover:bg-mineshaft-700 ${
                            cannotBeAdded && !isAlreadySynced ? "opacity-50" : ""
                          }`}
                          onClick={() => {
                            if (!cannotBeAdded || isAlreadySynced) {
                              handleToggleSelection(cert.id);
                            }
                          }}
                        >
                          <Td className="max-w-0">
                            <Checkbox
                              id={cert.id}
                              isChecked={selectedIds.includes(cert.id)}
                              onCheckedChange={() => {
                                if (!cannotBeAdded || isAlreadySynced) {
                                  handleToggleSelection(cert.id);
                                }
                              }}
                              isDisabled={cannotBeAdded && !isAlreadySynced}
                            />
                          </Td>
                          <Td className="max-w-0">
                            <div className="truncate" title={cert.commonName}>
                              {cert.commonName}
                            </div>
                          </Td>
                          <Td className="max-w-0">
                            <div
                              className="truncate font-mono text-xs text-bunker-300"
                              title={cert.serialNumber}
                            >
                              {cert.serialNumber}
                            </div>
                          </Td>
                          <Td className="max-w-0">
                            <Badge
                              variant={
                                cert.status === CertStatus.ACTIVE && !isExpired
                                  ? "success"
                                  : "danger"
                              }
                            >
                              {(() => {
                                if (isRevoked) return "Revoked";
                                if (isExpired) return "Expired";
                                return cert.status === CertStatus.ACTIVE ? "Active" : cert.status;
                              })()}
                            </Badge>
                          </Td>
                          <Td className="max-w-0">
                            <span
                              className={`text-sm ${isExpired ? "text-red-400" : "text-bunker-300"}`}
                            >
                              {new Date(cert.notAfter).toLocaleDateString()}
                            </span>
                          </Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </Table>
              </TableContainer>

              {totalPages > 1 && (
                <div className="mt-4 flex justify-center">
                  <Pagination
                    count={totalCount}
                    page={currentPage}
                    perPage={pageSize}
                    onChangePage={(page: number) => setCurrentPage(page)}
                    onChangePerPage={() => {}}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="solid"
            colorSchema="primary"
            onClick={handleSaveCertificates}
            isLoading={isLoading}
          >
            {saveButtonText}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};
