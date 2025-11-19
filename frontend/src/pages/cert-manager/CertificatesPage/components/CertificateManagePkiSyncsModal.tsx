import { useEffect, useMemo, useState } from "react";
import { faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
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
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import {
  PkiSync,
  useAddCertificatesToPkiSync,
  useListPkiSyncsWithCertificate,
  useRemoveCertificatesFromPkiSync
} from "@app/hooks/api/pkiSyncs";
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
};

const PER_PAGE = 10;

export const CertificateManagePkiSyncsModal = ({ popUp, handlePopUpToggle }: Props) => {
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

  const handleNavigateToPkiSyncs = () => {
    if (!currentProject?.id) return;

    navigate({
      to: ROUTE_PATHS.CertManager.IntegrationsListPage.path,
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id
      },
      search: {
        selectedTab: IntegrationsListPageTabs.PkiSyncs
      }
    });
    handleClose();
  };

  const getDestinationDisplayName = (destination: string) => {
    switch (destination) {
      case PkiSync.AzureKeyVault:
        return "Azure Key Vault";
      case PkiSync.AwsCertificateManager:
        return "AWS Certificate Manager";
      default:
        return destination;
    }
  };

  useEffect(() => {
    if (!certificateId || !pkiSyncs || pkiSyncs.length === 0) return;

    const currentSyncIds = new Set(
      pkiSyncs.filter((sync) => sync.hasCertificate).map((sync) => sync.id)
    );
    setSelectedSyncIds(currentSyncIds);
    setInitialSyncIds(new Set(currentSyncIds));
  }, [certificateId, pkiSyncs]);

  const handleSyncToggle = (syncId: string) => {
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
    <Modal isOpen={popUp.isOpen} onOpenChange={handleClose}>
      <ModalContent
        title="Manage PKI Syncs"
        subTitle={`Select which PKI syncs "${commonName}" should be part of`}
        className="max-w-3xl"
      >
        <div className="mb-4">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search PKI syncs by name..."
          />
        </div>
        <div className="mt-4 max-h-96 overflow-y-auto">
          {isPending && (
            <div className="flex h-32 items-center justify-center">
              <div className="text-bunker-300">Loading PKI syncs...</div>
            </div>
          )}
          {!isPending && pkiSyncs.length === 0 && (
            <EmptyState title="No PKI syncs available" icon={faPlus}>
              <div className="mt-1">
                Create a{" "}
                <button
                  type="button"
                  onClick={handleNavigateToPkiSyncs}
                  className="cursor-pointer underline hover:text-mineshaft-300"
                >
                  PKI sync
                </button>{" "}
                first to manage certificate syncing.
              </div>
            </EmptyState>
          )}
          {!isPending && pkiSyncs.length > 0 && filteredSyncs.length === 0 && searchTerm && (
            <EmptyState title="No PKI syncs found" icon={faSearch}>
              <div className="mt-1">
                No PKI syncs match your search criteria. Try a different search term.
              </div>
            </EmptyState>
          )}
          {!isPending && filteredSyncs.length > 0 && (
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-12" />
                    <Th className="w-1/2">Name</Th>
                    <Th className="w-1/2">Destination</Th>
                  </Tr>
                </THead>
                <TBody>
                  {paginatedSyncs.map((sync) => (
                    <Tr
                      key={sync.id}
                      className="cursor-pointer hover:bg-mineshaft-700"
                      onClick={() => handleSyncToggle(sync.id)}
                    >
                      <Td>
                        <Checkbox
                          isChecked={selectedSyncIds.has(sync.id)}
                          onCheckedChange={() => handleSyncToggle(sync.id)}
                          id={`sync-${sync.id}`}
                        />
                      </Td>
                      <Td className="w-1/2 max-w-0">
                        <div className="truncate" title={sync.name}>
                          {sync.name}
                        </div>
                      </Td>
                      <Td className="w-1/2 max-w-0">
                        <div
                          className="truncate capitalize"
                          title={getDestinationDisplayName(sync.destination)}
                        >
                          {getDestinationDisplayName(sync.destination)}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
          {!isPending && filteredSyncs.length > PER_PAGE && (
            <div className="mt-4">
              <Pagination
                count={filteredSyncs.length}
                page={currentPage}
                perPage={PER_PAGE}
                onChangePage={setCurrentPage}
                onChangePerPage={() => {}}
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline_bg" onClick={handleClose} isDisabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="solid"
            colorSchema="primary"
            onClick={handleSaveChanges}
            isDisabled={isSubmitting}
            isLoading={isSubmitting}
          >
            Save Changes
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};
