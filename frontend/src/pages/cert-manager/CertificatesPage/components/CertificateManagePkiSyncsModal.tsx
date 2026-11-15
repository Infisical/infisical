import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  hasAnyFilter,
  isCertificateOrderTheOnlyFilter
} from "@app/components/pki-syncs/forms/pki-sync-filter-fns";
import {
  Button,
  Checkbox,
  DiscardChangesAlertDialog,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Pagination,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import {
  useAddCertificatesToPkiSync,
  useListPkiSyncsWithCertificate,
  useRemoveCertificatesFromPkiSync
} from "@app/hooks/api/pkiSyncs";
import { TPkiSync } from "@app/hooks/api/pkiSyncs/types";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { ApplicationTab } from "@app/pages/cert-manager/ApplicationDetailsByIDPage/application-tabs";
import { IntegrationsListPageTabs } from "@app/types/integrations";

type Props = {
  popUp: {
    isOpen: boolean;
    data?: {
      certificateId?: string;
      commonName?: string;
    };
  };
  handlePopUpToggle: (popUpName: "managePkiSyncs", state?: boolean) => void;
  applicationName?: string;
};

const getSyncUnavailableReason = (sync: TPkiSync): string | null => {
  if (!sync.applicationId) return "Not attached to an Application";
  if (!hasAnyFilter(sync.filters)) return "No filters set";
  if (!isCertificateOrderTheOnlyFilter(sync.filters))
    return "Selects certificates by profile or metadata";
  return null;
};

const PER_PAGE = 10;

export const CertificateManagePkiSyncsModal = ({
  popUp,
  handlePopUpToggle,
  applicationName
}: Props) => {
  const [selectedSyncIds, setSelectedSyncIds] = useState<Set<string>>(new Set());
  const [initialSyncIds, setInitialSyncIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const { certificateId, commonName } = popUp.data || {};

  const { data: pkiSyncs = [], isPending } = useListPkiSyncsWithCertificate(
    currentProject?.id || "",
    certificateId || "",
    {
      enabled: !!currentProject?.id && !!certificateId
    }
  );
  const addCertificatesToSync = useAddCertificatesToPkiSync();
  const removeCertificatesFromSync = useRemoveCertificatesFromPkiSync();

  const filteredSyncs = useMemo(() => {
    if (!searchTerm.trim()) return pkiSyncs;

    const searchLower = searchTerm.toLowerCase();
    return pkiSyncs.filter((sync) => sync.name.toLowerCase().includes(searchLower));
  }, [pkiSyncs, searchTerm]);

  const startIndex = (currentPage - 1) * PER_PAGE;
  const endIndex = startIndex + PER_PAGE;
  const paginatedSyncs = filteredSyncs.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleClose = () => {
    handlePopUpToggle("managePkiSyncs", false);
    setSelectedSyncIds(new Set());
    setInitialSyncIds(new Set());
    setSearchTerm("");
    setCurrentPage(1);
  };

  const { isDiscardDialogOpen, setIsDiscardDialogOpen, requestDiscard, confirmDiscard } =
    useDiscardChangesGuard({
      isDirty:
        selectedSyncIds.size !== initialSyncIds.size ||
        Array.from(selectedSyncIds).some((id) => !initialSyncIds.has(id)),
      onDiscard: handleClose
    });

  const handleNavigateToPkiSyncs = () => {
    if (!currentProject?.id) return;

    if (applicationName) {
      navigate({
        to: "/organizations/$orgId/cert-manager/applications/$applicationName",
        params: {
          orgId: currentOrg.id,
          applicationName
        },
        search: { selectedTab: ApplicationTab.Syncs }
      });
    } else {
      navigate({
        to: ROUTE_PATHS.CertManager.IntegrationsListPage.path,
        params: {
          orgId: currentOrg.id
        },
        search: {
          selectedTab: IntegrationsListPageTabs.PkiSyncs
        }
      });
    }
    handleClose();
  };

  useEffect(() => {
    if (!popUp.isOpen || !certificateId || pkiSyncs.length === 0) return;

    const currentSyncIds = new Set(
      pkiSyncs.filter((sync) => sync.hasCertificate).map((sync) => sync.id)
    );
    setSelectedSyncIds(currentSyncIds);
    setInitialSyncIds(new Set(currentSyncIds));
  }, [popUp.isOpen, certificateId, pkiSyncs]);

  const handleSyncToggle = (syncId: string) => {
    if (isSubmitting) return;
    setSelectedSyncIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(syncId)) {
        newSet.delete(syncId);
      } else {
        newSet.add(syncId);
      }
      return newSet;
    });
  };

  const handleSaveChanges = async () => {
    if (!certificateId) return;

    try {
      setIsSubmitting(true);

      const syncsToAdd = Array.from(selectedSyncIds).filter((id) => !initialSyncIds.has(id));
      const syncsToRemove = Array.from(initialSyncIds).filter((id) => !selectedSyncIds.has(id));

      await Promise.all(
        syncsToAdd.map((syncId) =>
          addCertificatesToSync.mutateAsync({
            pkiSyncId: syncId,
            certificateIds: [certificateId]
          })
        )
      );

      await Promise.all(
        syncsToRemove.map((syncId) =>
          removeCertificatesFromSync.mutateAsync({
            pkiSyncId: syncId,
            certificateIds: [certificateId]
          })
        )
      );

      createNotification({
        text: `PKI sync settings updated for certificate "${commonName}"`,
        type: "success"
      });

      handleClose();
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to update PKI sync settings",
        type: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Sheet
        open={popUp.isOpen}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) requestDiscard();
        }}
      >
        <SheetContent size="form" isPending={isSubmitting}>
          <SheetHeader>
            <SheetTitle>Manage PKI Syncs</SheetTitle>
            <SheetDescription>{`Select which PKI syncs "${commonName}" should be part of.`}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <Input
              aria-label="Search PKI syncs"
              disabled={isSubmitting}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search PKI syncs by name..."
            />
            {isPending && (
              <div className="flex h-32 items-center justify-center">
                <div className="text-muted">Loading PKI syncs...</div>
              </div>
            )}
            {!isPending && pkiSyncs.length === 0 && (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>No PKI Syncs Available</EmptyTitle>
                  <EmptyDescription>
                    Create a{" "}
                    <button
                      type="button"
                      onClick={handleNavigateToPkiSyncs}
                      className="cursor-pointer underline"
                    >
                      PKI sync
                    </button>{" "}
                    first to manage certificate syncing.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {!isPending && pkiSyncs.length > 0 && filteredSyncs.length === 0 && searchTerm && (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>No PKI Syncs Found</EmptyTitle>
                  <EmptyDescription>
                    No PKI syncs match your search criteria. Try a different search term.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {!isPending && filteredSyncs.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12" />
                    <TableHead className="w-1/2">Name</TableHead>
                    <TableHead className="w-1/2">Destination</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSyncs.map((sync) => {
                    const unavailableReason = getSyncUnavailableReason(sync);
                    const managesItsOwnCertificates = Boolean(unavailableReason);

                    return (
                      <TableRow
                        key={sync.id}
                        className={managesItsOwnCertificates ? "opacity-60" : "cursor-pointer"}
                        onClick={() => !managesItsOwnCertificates && handleSyncToggle(sync.id)}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            aria-label={`Select ${sync.name}`}
                            isChecked={selectedSyncIds.has(sync.id)}
                            isDisabled={managesItsOwnCertificates || isSubmitting}
                            onCheckedChange={() => handleSyncToggle(sync.id)}
                            id={`sync-${sync.id}`}
                          />
                        </TableCell>
                        <TableCell className="w-1/2 max-w-0">
                          <div className="truncate" title={sync.name}>
                            {sync.name}
                          </div>
                          {unavailableReason && (
                            <div className="truncate text-xs text-muted">{unavailableReason}</div>
                          )}
                        </TableCell>
                        <TableCell className="w-1/2 max-w-0">
                          <div
                            className="truncate capitalize"
                            title={PKI_SYNC_MAP[sync.destination].name}
                          >
                            {PKI_SYNC_MAP[sync.destination].name}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {!isPending && filteredSyncs.length > PER_PAGE && (
              <div className="mt-4">
                <Pagination
                  count={filteredSyncs.length}
                  page={currentPage}
                  perPage={PER_PAGE}
                  perPageList={[PER_PAGE]}
                  onChangePage={setCurrentPage}
                  onChangePerPage={() => {}}
                />
              </div>
            )}
          </div>

          <SheetFooter className="justify-end border-t">
            <Button variant="ghost" onClick={requestDiscard} isDisabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="project" onClick={handleSaveChanges} isPending={isSubmitting}>
              Save Changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your PKI sync selection changes will be lost."
      />
    </>
  );
};
