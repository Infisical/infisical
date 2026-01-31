import { useState } from "react";
import { faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
  Input,
  Pagination,
  Skeleton,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useProject } from "@app/context";
import { useDebounce } from "@app/hooks";
import { useDeletePkiAlertV2, useGetPkiAlertsV2 } from "@app/hooks/api/pkiAlertsV2";

import { CreatePkiAlertV2Modal } from "./components/CreatePkiAlertV2Modal";
import { PkiAlertV2Row } from "./components/PkiAlertV2Row";
import { ViewPkiAlertV2Modal } from "./components/ViewPkiAlertV2Modal";

interface Props {
  hideContainer?: boolean;
}

export const PkiAlertsV2Page = ({ hideContainer = false }: Props) => {
  const { currentProject } = useProject();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 500);

  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; alertId?: string }>({
    isOpen: false
  });
  const [viewModal, setViewModal] = useState<{ isOpen: boolean; alertId?: string }>({
    isOpen: false
  });
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    alertId?: string;
    name?: string;
  }>({
    isOpen: false
  });

  const { data: alertsData, isLoading } = useGetPkiAlertsV2({
    projectId: currentProject?.id || "",
    search: debouncedSearch || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });

  const { mutateAsync: deletePkiAlert } = useDeletePkiAlertV2();

  const handleDeleteAlert = async () => {
    if (!deleteModal.alertId) return;

    try {
      await deletePkiAlert({ alertId: deleteModal.alertId });
      setDeleteModal({ isOpen: false });
      createNotification({
        text: "PKI alert deleted successfully",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to delete PKI alert",
        type: "error"
      });
    }
  };

  const totalPages = Math.ceil((alertsData?.total || 0) / perPage);

  const renderTableContent = () => {
    if (isLoading) {
      return Array.from({ length: 5 }, (_, index) => (
        <Tr key={`skeleton-${index}`}>
          <Td>
            <Skeleton className="h-4 w-32" />
          </Td>
          <Td>
            <Skeleton className="h-4 w-24" />
          </Td>
          <Td>
            <Skeleton className="h-4 w-16" />
          </Td>
          <Td>
            <Skeleton className="h-4 w-16" />
          </Td>
          <Td>
            <Skeleton className="h-4 w-20" />
          </Td>
          <Td className="text-right">
            <Skeleton className="ml-auto h-4 w-24" />
          </Td>
        </Tr>
      ));
    }

    if (alertsData?.alerts?.length) {
      return alertsData.alerts.map((alert) => (
        <PkiAlertV2Row
          key={alert.id}
          alert={alert}
          onView={() => setViewModal({ isOpen: true, alertId: alert.id })}
          onEdit={() => setAlertModal({ isOpen: true, alertId: alert.id })}
          onDelete={() =>
            setDeleteModal({
              isOpen: true,
              alertId: alert.id,
              name: alert.name
            })
          }
        />
      ));
    }

    return (
      <Tr>
        <Td colSpan={6} className="py-8 text-center text-gray-400">
          {search ? "No alerts found matching your search." : "No PKI alerts configured yet."}
        </Td>
      </Tr>
    );
  };

  return (
    <div className={hideContainer ? "" : "container mx-auto p-6"}>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="text-lg font-medium text-mineshaft-100">Certificate Alerts</h3>
          <Button
            variant="solid"
            colorSchema="primary"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => setAlertModal({ isOpen: true })}
          >
            Create Certificate Alert
          </Button>
        </div>

        <div className="mb-4 flex items-center">
          <div className="relative w-full">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute top-1/2 left-3 -translate-y-1/2 transform text-gray-400"
            />
            <Input
              placeholder="Search alerts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10"
            />
          </div>
        </div>

        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Event Type</Th>
                <Th>Status</Th>
                <Th>Alert Before</Th>
                <Th>Last Run</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </THead>
            <TBody>{renderTableContent()}</TBody>
          </Table>
        </TableContainer>

        {totalPages > 1 && (
          <div className="mt-4 flex justify-center">
            <Pagination
              count={totalPages}
              page={page}
              onChangePage={setPage}
              perPage={perPage}
              onChangePerPage={setPerPage}
            />
          </div>
        )}
      </div>

      <CreatePkiAlertV2Modal
        isOpen={alertModal.isOpen}
        onOpenChange={(isOpen) => setAlertModal({ isOpen, alertId: undefined })}
        alertId={alertModal.alertId}
      />

      <ViewPkiAlertV2Modal
        isOpen={viewModal.isOpen}
        onOpenChange={(isOpen) => setViewModal({ isOpen, alertId: undefined })}
        alertId={viewModal.alertId}
      />

      <DeleteActionModal
        isOpen={deleteModal.isOpen}
        deleteKey="delete"
        title={`Delete PKI Alert "${deleteModal.name}"`}
        onChange={(isOpen) => setDeleteModal({ isOpen, alertId: undefined, name: undefined })}
        onDeleteApproved={handleDeleteAlert}
      />
    </div>
  );
};
