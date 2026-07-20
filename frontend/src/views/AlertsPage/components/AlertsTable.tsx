import { useMemo } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";

import { VariablePermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { OrgPermissionSubjects, ProjectPermissionSub } from "@app/context";
import { OrgPermissionIdentityActions } from "@app/context/OrgPermissionContext/types";
import { ProjectPermissionIdentityActions } from "@app/context/ProjectPermissionContext/types";
import { usePagination, usePopUp, useResetPageHelper, useScopeVariant } from "@app/hooks";
import { AlertResourceType, TAlert, useListAlerts } from "@app/hooks/api/alerts";

import { AddAlertModal } from "./AddAlertModal";
import { AlertRow } from "./AlertRow";
import { DeleteAlertModal } from "./DeleteAlertModal";

type Props = {
  projectId?: string;
  scopeName?: string;
};

export const AlertsTable = ({ projectId, scopeName }: Props) => {
  const isProjectView = Boolean(projectId);
  const scopeVariant = useScopeVariant();

  const { isPending, data: allAlerts = [] } = useListAlerts({
    resourceType: AlertResourceType.IdentityCredential,
    ...(projectId ? { projectId } : {})
  });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addAlert",
    "editAlert",
    "deleteAlert"
  ] as const);

  const { search, setSearch, setPage, page, perPage, setPerPage, offset } = usePagination("", {
    initPerPage: 20
  });

  const filteredAlerts = useMemo(
    () =>
      allAlerts
        .filter((alert) => (projectId ? alert.projectId === projectId : alert.projectId === null))
        .filter((alert) => {
          const value = search.trim().toLowerCase();
          if (!value) return true;
          return (
            alert.name.toLowerCase().includes(value) ||
            (alert.description ?? "").toLowerCase().includes(value)
          );
        }),
    [allAlerts, projectId, search]
  );

  useResetPageHelper({ totalCount: filteredAlerts.length, offset, setPage });

  const visibleAlerts = filteredAlerts.slice(offset, perPage * page);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <CardDescription>
            Configure notifications for resource events such as expiring identity credentials.
          </CardDescription>
          <CardAction>
            <VariablePermissionCan
              type={isProjectView ? "project" : "org"}
              I={
                isProjectView
                  ? ProjectPermissionIdentityActions.Edit
                  : OrgPermissionIdentityActions.Edit
              }
              a={isProjectView ? ProjectPermissionSub.Identity : OrgPermissionSubjects.Identity}
            >
              {(isAllowed) => (
                <Button
                  variant={scopeVariant}
                  onClick={() => handlePopUpOpen("addAlert")}
                  isDisabled={!isAllowed}
                >
                  <PlusIcon />
                  Add Alert
                </Button>
              )}
            </VariablePermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <InputGroup className="flex-1">
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search alerts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
          </div>
          <div className="mt-4">
            {!isPending && !filteredAlerts.length ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>
                    {allAlerts.length ? "No alerts match search" : "No alerts have been configured"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {allAlerts.length
                      ? "Adjust your search to view alerts."
                      : "Add an alert to start receiving notifications."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Channels</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-5" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isPending &&
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`skeleton-${i + 1}`}>
                          {Array.from({ length: 7 }).map((__, j) => (
                            <TableCell key={`skeleton-cell-${i + 1}-${j + 1}`}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    {!isPending &&
                      visibleAlerts.map((alert) => (
                        <AlertRow
                          key={alert.id}
                          alert={alert}
                          onEdit={(data) => handlePopUpOpen("editAlert", data)}
                          onDelete={(data) => handlePopUpOpen("deleteAlert", data)}
                        />
                      ))}
                  </TableBody>
                </Table>
                {!isPending && (
                  <Pagination
                    count={filteredAlerts.length}
                    page={page}
                    perPage={perPage}
                    onChangePage={setPage}
                    onChangePerPage={setPerPage}
                  />
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
      <AddAlertModal
        isOpen={popUp.addAlert.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addAlert", isOpen)}
        projectId={projectId}
        scopeName={scopeName}
      />
      <AddAlertModal
        isOpen={popUp.editAlert.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editAlert", isOpen)}
        projectId={projectId}
        scopeName={scopeName}
        alert={popUp.editAlert.data as TAlert | undefined}
      />
      <DeleteAlertModal
        isOpen={popUp.deleteAlert.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteAlert", isOpen)}
        alert={popUp.deleteAlert.data as TAlert | undefined}
      />
    </>
  );
};
