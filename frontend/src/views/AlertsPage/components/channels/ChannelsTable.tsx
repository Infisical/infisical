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
import { OrgPermissionActions } from "@app/context/OrgPermissionContext/types";
import { ProjectPermissionActions } from "@app/context/ProjectPermissionContext/types";
import { usePagination, usePopUp, useResetPageHelper, useScopeVariant } from "@app/hooks";
import { TAlertChannel, useListAlertChannels } from "@app/hooks/api/alertChannels";

import { AddChannelModal } from "./AddChannelModal";
import { ChannelRow } from "./ChannelRow";
import { DeleteChannelModal } from "./DeleteChannelModal";

type Props = {
  projectId?: string;
};

export const ChannelsTable = ({ projectId }: Props) => {
  const isProjectView = Boolean(projectId);
  const scopeVariant = useScopeVariant();

  const { isPending, data: allChannels = [] } = useListAlertChannels(
    projectId ? { projectId } : {}
  );

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addChannel",
    "editChannel",
    "deleteChannel"
  ] as const);

  const { search, setSearch, setPage, page, perPage, setPerPage, offset } = usePagination("", {
    initPerPage: 20
  });

  const filteredChannels = useMemo(
    () =>
      allChannels.filter((channel) => {
        const value = search.trim().toLowerCase();
        if (!value) return true;
        return channel.name.toLowerCase().includes(value);
      }),
    [allChannels, search]
  );

  useResetPageHelper({ totalCount: filteredChannels.length, offset, setPage });

  const visibleChannels = filteredChannels.slice(offset, perPage * page);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>
            Reusable delivery destinations. Create a channel once, then attach it to any alert.
          </CardDescription>
          <CardAction>
            <VariablePermissionCan
              type={isProjectView ? "project" : "org"}
              I={isProjectView ? ProjectPermissionActions.Create : OrgPermissionActions.Create}
              a={isProjectView ? ProjectPermissionSub.Settings : OrgPermissionSubjects.Settings}
            >
              {(isAllowed) => (
                <Button
                  variant={scopeVariant}
                  onClick={() => handlePopUpOpen("addChannel")}
                  isDisabled={!isAllowed}
                >
                  <PlusIcon />
                  Add Channel
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
                placeholder="Search channels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
          </div>
          <div className="mt-4">
            {!isPending && !filteredChannels.length ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>
                    {allChannels.length
                      ? "No channels match search"
                      : "No channels have been created"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {allChannels.length
                      ? "Adjust your search to view channels."
                      : "Add a channel to route alert notifications."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Used by</TableHead>
                      <TableHead className="w-5" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isPending &&
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`skeleton-${i + 1}`}>
                          {Array.from({ length: 4 }).map((__, j) => (
                            <TableCell key={`skeleton-cell-${i + 1}-${j + 1}`}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    {!isPending &&
                      visibleChannels.map((channel) => (
                        <ChannelRow
                          key={channel.id}
                          channel={channel}
                          onEdit={(data) => handlePopUpOpen("editChannel", data)}
                          onDelete={(data) => handlePopUpOpen("deleteChannel", data)}
                        />
                      ))}
                  </TableBody>
                </Table>
                {!isPending && (
                  <Pagination
                    count={filteredChannels.length}
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
      <AddChannelModal
        isOpen={popUp.addChannel.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addChannel", isOpen)}
        projectId={projectId}
      />
      <AddChannelModal
        isOpen={popUp.editChannel.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editChannel", isOpen)}
        projectId={projectId}
        channel={popUp.editChannel.data as TAlertChannel | undefined}
      />
      <DeleteChannelModal
        isOpen={popUp.deleteChannel.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteChannel", isOpen)}
        channel={popUp.deleteChannel.data as TAlertChannel | undefined}
      />
    </>
  );
};
