import React, { useEffect, useState } from "react";
import { ScrollText, Search, X } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { getCertificateDisplayName, truncateCertificateSerialNumber } from "@app/helpers/pkiSyncs";
import {
  CertStatus,
  useAddCertificatesToPkiSync,
  useListPkiSyncCertificates,
  useRemoveCertificatesFromPkiSync
} from "@app/hooks/api";
import { PkiSync, TPkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  pkiSync?: TPkiSync;
  destination?: PkiSync;
  applicationId?: string;
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
  destination,
  applicationId: applicationIdProp,
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
  const scopedApplicationId = pkiSync?.applicationId ?? applicationIdProp;

  const { syncOption } = usePkiSyncOption((pkiSync?.destination ?? destination) as PkiSync);
  const isSingleSelect = syncOption?.maxCertificates === 1;

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
    forPkiSync: true,
    applicationId: scopedApplicationId
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
    setSelectedIds((prev) => {
      if (prev.includes(certId)) {
        return prev.filter((id) => id !== certId);
      }
      // Single-slot destinations (e.g. Nutanix) allow only one certificate
      return isSingleSelect ? [certId] : [...prev, certId];
    });
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

      type TOperationResult = {
        type: "add" | "remove";
        count: number;
        success: boolean;
        error?: unknown;
      };

      const runRemove = async (): Promise<TOperationResult | null> => {
        if (certificatesToRemove.length === 0) return null;
        try {
          await removeCertificatesFromSync.mutateAsync({
            pkiSyncId: pkiSync.id,
            certificateIds: certificatesToRemove
          });
          return { type: "remove", count: certificatesToRemove.length, success: true };
        } catch (error) {
          return { type: "remove", count: certificatesToRemove.length, success: false, error };
        }
      };

      const runAdd = async (): Promise<TOperationResult | null> => {
        if (certificatesToAdd.length === 0) return null;
        try {
          await addCertificatesToSync.mutateAsync({
            pkiSyncId: pkiSync.id,
            certificateIds: certificatesToAdd
          });
          return { type: "add", count: certificatesToAdd.length, success: true };
        } catch (error) {
          return { type: "add", count: certificatesToAdd.length, success: false, error };
        }
      };

      let results: (TOperationResult | null)[];
      if (isSingleSelect) {
        // Single-slot destinations (e.g. Nutanix, maxCertificates: 1) must remove the
        // existing certificate before adding the replacement, otherwise the add would
        // transiently exceed the limit and be rejected. Other destinations keep the
        // original parallel behavior so their flow is unchanged.
        results = [await runRemove(), await runAdd()];
      } else {
        results = await Promise.all([runAdd(), runRemove()]);
      }

      const completed = results.filter((r): r is TOperationResult => r !== null);

      if (completed.length === 0) {
        createNotification({
          text: "No changes to save",
          type: "info"
        });
        onClose();
        return;
      }

      const failures = completed.filter((r) => !r.success);
      const successes = completed.filter((r) => r.success);

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

        const firstError = failures.map((f) => (f as { error?: unknown }).error).find(Boolean) as
          | { response?: { data?: { message?: string } }; message?: string }
          | undefined;
        const reason =
          firstError?.response?.data?.message ?? firstError?.message ?? "Please try again.";

        createNotification({
          text: partialSuccess
            ? `Some certificate changes could not be saved: ${reason}`
            : `Failed to update certificate selection: ${reason}`,
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search by common name, serial number, or SAN..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
            {searchTerm && (
              <InputGroupAddon align="inline-end">
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={clearSearch}
                  className="cursor-pointer text-muted transition-colors hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </InputGroupAddon>
            )}
          </InputGroup>

          <div>
            {allCertificates.length === 0 ? (
              <Empty className="border">
                <EmptyMedia variant="icon">
                  <ScrollText />
                </EmptyMedia>
                <EmptyTitle>No certificates found</EmptyTitle>
                <EmptyDescription>
                  {searchTerm
                    ? "No certificates match your search criteria."
                    : "No certificates available for sync."}
                </EmptyDescription>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      {!isSingleSelect && (
                        <Checkbox
                          id="select-all-certificates"
                          variant="project"
                          isChecked={
                            allCertificates.length > 0 &&
                            allCertificates.every((cert) => selectedIds.includes(cert.id))
                          }
                          onCheckedChange={handleSelectAll}
                        />
                      )}
                    </TableHead>
                    <TableHead className="w-1/3">SAN / CN</TableHead>
                    <TableHead className="w-1/4">Serial Number</TableHead>
                    <TableHead className="w-1/6">Issued At</TableHead>
                    <TableHead className="w-1/6">Expires At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allCertificates.map((cert) => {
                    const isExpired = new Date(cert.notAfter) < new Date();
                    const isRevoked = cert.status === CertStatus.REVOKED;
                    const cannotBeAdded = isExpired || isRevoked;
                    const isAlreadySynced = syncedCertificateIds.includes(cert.id);

                    const { originalDisplayName, displayName, isTruncated } =
                      getCertificateDisplayName(cert);
                    const truncatedSerial = truncateCertificateSerialNumber(cert.serialNumber);

                    return (
                      <TableRow
                        key={cert.id}
                        className={`cursor-pointer ${
                          cannotBeAdded && !isAlreadySynced ? "opacity-50" : ""
                        }`}
                        onClick={() => {
                          if (!cannotBeAdded || isAlreadySynced) {
                            handleToggleSelection(cert.id);
                          }
                        }}
                      >
                        <TableCell className="max-w-0" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            id={cert.id}
                            variant="project"
                            isChecked={selectedIds.includes(cert.id)}
                            onCheckedChange={() => {
                              if (!cannotBeAdded || isAlreadySynced) {
                                handleToggleSelection(cert.id);
                              }
                            }}
                            isDisabled={cannotBeAdded && !isAlreadySynced}
                          />
                        </TableCell>
                        <TableCell className="max-w-0">
                          {isTruncated ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="truncate">{displayName}</div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-lg">
                                {originalDisplayName}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <div className="truncate">{displayName}</div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-0">
                          <div className="font-mono text-xs text-muted" title={cert.serialNumber}>
                            {truncatedSerial}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-0">
                          <span className="text-sm text-muted">
                            {new Date(cert.notBefore).toLocaleDateString()}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-0">
                          <span className={`text-sm ${isExpired ? "text-danger" : "text-muted"}`}>
                            {new Date(cert.notAfter).toLocaleDateString()}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {totalPages > 1 && (
              <Pagination
                count={totalCount}
                page={currentPage}
                perPage={pageSize}
                onChangePage={(page: number) => setCurrentPage(page)}
                onChangePerPage={() => {}}
                perPageList={[pageSize]}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="project" onClick={handleSaveCertificates} isPending={isLoading}>
            {saveButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
