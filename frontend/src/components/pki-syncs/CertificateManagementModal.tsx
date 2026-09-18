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
import { CertStatus } from "@app/hooks/api";
import { PkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  destination?: PkiSync;
  applicationId?: string;
  selectedOrderIds?: string[];
  maxSelectable?: number;
  onOrderSelectionChange?: (orderIds: string[], orderNames: [string, string][]) => void;
  title?: string;
  subtitle?: string;
  saveButtonText?: string;
};

export const CertificateManagementModal = ({
  isOpen,
  onClose,
  destination,
  applicationId: applicationIdProp,
  selectedOrderIds,
  maxSelectable,
  onOrderSelectionChange,
  title = "Manage Certificate Sync",
  subtitle = "Select which certificates should be synced.",
  saveButtonText = "Save Changes"
}: Props) => {
  const { currentProject } = useProject();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const pageSize = 10;

  const scopedApplicationId = applicationIdProp;

  const { syncOption } = usePkiSyncOption(destination as PkiSync);
  const selectionLimit = maxSelectable ?? syncOption?.maxCertificates;
  const isSingleSelect = selectionLimit === 1;

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

  const preselectedOrderIds = selectedOrderIds ?? [];

  const totalPages = Math.ceil(totalCount / pageSize);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const orderNamesSeen = React.useRef(new Map<string, string>());

  React.useEffect(() => {
    setSelectedIds(preselectedOrderIds);
  }, [JSON.stringify(preselectedOrderIds)]);

  React.useEffect(() => {
    allCertificates.forEach((cert) => {
      if (cert.orderId) orderNamesSeen.current.set(cert.orderId, cert.commonName);
    });
  }, [allCertificates]);

  const handleToggleSelection = (orderId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(orderId)) {
        return prev.filter((id) => id !== orderId);
      }

      if (isSingleSelect) return [orderId];

      if (selectionLimit !== undefined && prev.length >= selectionLimit) {
        createNotification({
          text: `This sync holds at most ${selectionLimit} certificates. Deselect one first.`,
          type: "error"
        });
        return prev;
      }

      return [...prev, orderId];
    });
  };

  const handleSelectAll = () => {
    const currentPageOrderIds = allCertificates
      .map((cert) => cert.orderId)
      .filter((orderId): orderId is string => Boolean(orderId));
    const allCurrentPageSelected = currentPageOrderIds.every((id) => selectedIds.includes(id));

    if (allCurrentPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentPageOrderIds.includes(id)));
      return;
    }

    setSelectedIds((prev) => {
      const next = [...new Set([...prev, ...currentPageOrderIds])];

      if (selectionLimit !== undefined && next.length > selectionLimit) {
        createNotification({
          text: `This sync holds at most ${selectionLimit} certificates. Only the first ${selectionLimit} were selected.`,
          type: "error"
        });
        return next.slice(0, selectionLimit);
      }

      return next;
    });
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

  const handleSaveCertificates = () => {
    const orderNames = selectedIds
      .filter((orderId) => orderNamesSeen.current.has(orderId))
      .map(
        (orderId) => [orderId, orderNamesSeen.current.get(orderId) as string] as [string, string]
      );

    onOrderSelectionChange?.(selectedIds, orderNames);
    onClose();
  };

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
                    <TableHead className="w-10">
                      {!isSingleSelect && (
                        <Checkbox
                          id="select-all-certificates"
                          variant="project"
                          aria-label="Select every certificate on this page"
                          isChecked={
                            allCertificates.length > 0 &&
                            allCertificates.every(
                              (cert) => cert.orderId && selectedIds.includes(cert.orderId)
                            )
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
                    const isAlreadySynced = Boolean(
                      cert.orderId && preselectedOrderIds.includes(cert.orderId)
                    );
                    const { orderId } = cert;
                    const isSelectable = Boolean(orderId) && (!cannotBeAdded || isAlreadySynced);
                    const isSelected = Boolean(orderId && selectedIds.includes(orderId));

                    const { originalDisplayName, displayName, isTruncated } =
                      getCertificateDisplayName(cert);
                    const truncatedSerial = truncateCertificateSerialNumber(cert.serialNumber);

                    return (
                      <TableRow
                        key={cert.id}
                        data-state={isSelected ? "selected" : undefined}
                        className={
                          isSelectable ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                        }
                        onClick={() => {
                          if (orderId && isSelectable) handleToggleSelection(orderId);
                        }}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            id={`select-certificate-${cert.id}`}
                            variant="project"
                            aria-label={`Select ${originalDisplayName}`}
                            isChecked={isSelected}
                            isDisabled={!isSelectable}
                            onCheckedChange={() => {
                              if (orderId && isSelectable) handleToggleSelection(orderId);
                            }}
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
          <Button variant="project" onClick={handleSaveCertificates}>
            {saveButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
