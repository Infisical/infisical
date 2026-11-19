import { useState } from "react";
import { SearchIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog,
  Empty,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { useDeletePkiAlertV2, useGetPkiAlertsV2 } from "@app/hooks/api/pkiAlertsV2";

import { PkiAlertV2Row } from "./components/PkiAlertV2Row";
import { ViewPkiAlertV2Modal } from "./components/ViewPkiAlertV2Modal";

interface Props {
  hideContainer?: boolean;
}

export const PkiAlertsV2Page = ({ hideContainer = false }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 500);

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

  return (
    <div className={hideContainer ? "" : "mx-auto max-w-8xl"}>
      <Card>
        <CardHeader>
          <CardTitle>
            Certificate Alerts <Badge variant="neutral">Legacy</Badge>
          </CardTitle>
          <CardDescription>
            Legacy alerts can only be viewed or deleted. Create new alerts in an application&apos;s
            Settings tab, or under Settings &gt; Alerts for all of Certificate Manager.
          </CardDescription>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search alerts"
              placeholder="Search alerts..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
        </CardHeader>
        <CardContent>
          {!isLoading && !alertsData?.alerts?.length ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  {search
                    ? "No alerts found matching your search."
                    : "No PKI alerts configured yet."}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Alert Before</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeletonRows columns={6} rows={5} />
                ) : (
                  alertsData?.alerts.map((alert) => (
                    <PkiAlertV2Row
                      key={alert.id}
                      alert={alert}
                      onView={() => setViewModal({ isOpen: true, alertId: alert.id })}
                      onDelete={() =>
                        setDeleteModal({ isOpen: true, alertId: alert.id, name: alert.name })
                      }
                    />
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {totalPages > 1 && (
          <CardFooter>
            <Pagination
              count={alertsData?.total || 0}
              page={page}
              onChangePage={setPage}
              perPage={perPage}
              onChangePerPage={setPerPage}
            />
          </CardFooter>
        )}
      </Card>
      <ViewPkiAlertV2Modal
        isOpen={viewModal.isOpen}
        onOpenChange={(isOpen) => setViewModal({ isOpen, alertId: undefined })}
        alertId={viewModal.alertId}
      />
      <ConfirmationAlertDialog
        isOpen={deleteModal.isOpen}
        description="This action is irreversible."
        confirmKey="delete"
        title={`Delete PKI Alert "${deleteModal.name}"`}
        onOpenChange={(isOpen) => setDeleteModal({ isOpen, alertId: undefined, name: undefined })}
        onConfirm={handleDeleteAlert}
      />
    </div>
  );
};
