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
import { OrgPermissionSubjects, ProjectPermissionSub, useOrganization } from "@app/context";
import { OrgPermissionIdentityActions } from "@app/context/OrgPermissionContext/types";
import { ProjectPermissionIdentityActions } from "@app/context/ProjectPermissionContext/types";
import { usePagination, usePopUp, useResetPageHelper, useScopeVariant } from "@app/hooks";
import { useGetOrganizationGroups, useGetOrgUsers } from "@app/hooks/api";
import {
  AlarmPrincipalType,
  AlarmResourceType,
  TAlarm,
  TAlarmRecipient,
  useListAlarms
} from "@app/hooks/api/alarms";

import { AddAlarmModal } from "./AddAlarmModal";
import { AlarmRow } from "./AlarmRow";
import { DeleteAlarmModal } from "./DeleteAlarmModal";

type Props = {
  projectId?: string;
  scopeName?: string;
};

export const AlarmsTable = ({ projectId, scopeName }: Props) => {
  const isProjectView = Boolean(projectId);
  const scopeVariant = useScopeVariant();
  const { currentOrg } = useOrganization();

  const { isPending, data: allAlarms = [] } = useListAlarms({
    resourceType: AlarmResourceType.IdentityCredential,
    ...(projectId ? { projectId } : {})
  });

  const { data: orgUsers = [] } = useGetOrgUsers(currentOrg.id);
  const { data: orgGroups = [] } = useGetOrganizationGroups(currentOrg.id);

  const resolveRecipientLabel = useMemo(() => {
    const lookup = new Map<string, string>();
    orgUsers.forEach((member) => {
      if (member.user?.id) {
        lookup.set(
          `${AlarmPrincipalType.User}:${member.user.id}`,
          member.user.username || member.user.email || member.user.id
        );
      }
    });
    orgGroups.forEach((group) => lookup.set(`${AlarmPrincipalType.Group}:${group.id}`, group.name));

    return (recipient: TAlarmRecipient) => {
      if (recipient.principalType === AlarmPrincipalType.Email) return recipient.principalId;
      return (
        lookup.get(`${recipient.principalType}:${recipient.principalId}`) ?? recipient.principalId
      );
    };
  }, [orgUsers, orgGroups]);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addAlarm",
    "editAlarm",
    "deleteAlarm"
  ] as const);

  const { search, setSearch, setPage, page, perPage, setPerPage, offset } = usePagination("", {
    initPerPage: 20
  });

  const filteredAlarms = useMemo(
    () =>
      allAlarms
        .filter((alarm) => (projectId ? alarm.projectId === projectId : alarm.projectId === null))
        .filter((alarm) => {
          const value = search.trim().toLowerCase();
          if (!value) return true;
          return (
            alarm.name.toLowerCase().includes(value) ||
            (alarm.description ?? "").toLowerCase().includes(value)
          );
        }),
    [allAlarms, projectId, search]
  );

  useResetPageHelper({ totalCount: filteredAlarms.length, offset, setPage });

  const visibleAlarms = filteredAlarms.slice(offset, perPage * page);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Alarms</CardTitle>
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
                  onClick={() => handlePopUpOpen("addAlarm")}
                  isDisabled={!isAllowed}
                >
                  <PlusIcon />
                  Add Alarm
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
                placeholder="Search alarms..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
          </div>
          <div className="mt-4">
            {!isPending && !filteredAlarms.length ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>
                    {allAlarms.length ? "No alarms match search" : "No alarms have been configured"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {allAlarms.length
                      ? "Adjust your search to view alarms."
                      : "Add an alarm to start receiving notifications."}
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
                      <TableHead>Recipients</TableHead>
                      <TableHead>Channels</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-5" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isPending &&
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`skeleton-${i + 1}`}>
                          {Array.from({ length: 8 }).map((__, j) => (
                            <TableCell key={`skeleton-cell-${i + 1}-${j + 1}`}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    {!isPending &&
                      visibleAlarms.map((alarm) => (
                        <AlarmRow
                          key={alarm.id}
                          alarm={alarm}
                          resolveRecipientLabel={resolveRecipientLabel}
                          onEdit={(data) => handlePopUpOpen("editAlarm", data)}
                          onDelete={(data) => handlePopUpOpen("deleteAlarm", data)}
                        />
                      ))}
                  </TableBody>
                </Table>
                {!isPending && (
                  <Pagination
                    count={filteredAlarms.length}
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
      <AddAlarmModal
        isOpen={popUp.addAlarm.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addAlarm", isOpen)}
        projectId={projectId}
        scopeName={scopeName}
      />
      <AddAlarmModal
        isOpen={popUp.editAlarm.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editAlarm", isOpen)}
        projectId={projectId}
        scopeName={scopeName}
        alarm={popUp.editAlarm.data as TAlarm | undefined}
      />
      <DeleteAlarmModal
        isOpen={popUp.deleteAlarm.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteAlarm", isOpen)}
        alarm={popUp.deleteAlarm.data as TAlarm | undefined}
      />
    </>
  );
};
