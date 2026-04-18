import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { EllipsisVerticalIcon, PlayIcon, PlusIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Input } from "@app/components/v2";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { ProjectPermissionSub, useOrganization, useProject } from "@app/context";
import { ProjectPermissionPamDiscoveryActions } from "@app/context/ProjectPermissionContext/types";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import type { TPamDiscoverySource } from "@app/hooks/api/pamDiscovery";
import {
  useDeletePamDiscoverySource,
  useListPamDiscoverySources,
  useTriggerPamDiscoveryScan
} from "@app/hooks/api/pamDiscovery";

import { PamAddDiscoverySourceModal } from "./PamAddDiscoverySourceModal";

const STATUS_BADGE_MAP: Record<string, "success" | "danger" | "info"> = {
  active: "success",
  paused: "info",
  error: "danger"
};

type Props = {
  projectId: string;
};

export const PamDiscoverySourcesTable = ({ projectId }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "addSource",
    "deleteSource"
  ] as const);

  const { search, debouncedSearch, setSearch, setPage, page, perPage, setPerPage, offset } =
    usePagination("", { initPerPage: 20 });

  const { data, isPending } = useListPamDiscoverySources({
    projectId,
    offset,
    limit: perPage,
    search: debouncedSearch
  });

  const sources = data?.sources || [];
  const totalCount = data?.totalCount || 0;

  useResetPageHelper({ totalCount, offset, setPage });

  const deleteMutation = useDeletePamDiscoverySource();
  const triggerScanMutation = useTriggerPamDiscoveryScan();

  const handleDelete = async () => {
    const source = popUp.deleteSource.data as TPamDiscoverySource;
    if (!source) return;
    try {
      await deleteMutation.mutateAsync({
        discoverySourceId: source.id,
        discoveryType: source.discoveryType
      });
      createNotification({ text: "Discovery source deleted", type: "success" });
      handlePopUpClose("deleteSource");
    } catch {
      createNotification({ text: "Failed to delete discovery source", type: "error" });
    }
  };

  const handleTriggerScan = async (source: TPamDiscoverySource) => {
    try {
      await triggerScanMutation.mutateAsync({
        discoverySourceId: source.id,
        discoveryType: source.discoveryType
      });
      createNotification({ text: "Scan triggered successfully", type: "success" });
    } catch {
      createNotification({ text: "Failed to trigger scan", type: "error" });
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search discovery sources..."
          className="h-full flex-1"
          containerClassName="h-9"
        />
        <ProjectPermissionCan
          I={ProjectPermissionPamDiscoveryActions.Create}
          a={ProjectPermissionSub.PamDiscovery}
        >
          {(isAllowed) => (
            <Button
              variant="project"
              onClick={() => handlePopUpOpen("addSource")}
              isDisabled={!isAllowed}
            >
              <PlusIcon />
              Add Discovery Source
            </Button>
          )}
        </ProjectPermissionCan>
      </div>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Resources</TableHead>
              <TableHead>Accounts</TableHead>
              <TableHead>Dependencies</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted">
                  Loading discovery sources...
                </TableCell>
              </TableRow>
            )}
            {!isPending && sources.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>
                  <Empty className="border-0 bg-transparent py-8 shadow-none">
                    <EmptyHeader>
                      <EmptyTitle>
                        {search ? "No discovery sources match search" : "No discovery sources"}
                      </EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
            {!isPending &&
              sources.map((source) => (
                <TableRow
                  key={source.id}
                  className="group cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: "/organizations/$orgId/projects/pam/$projectId/discovery/$discoveryType/$discoverySourceId",
                      params: {
                        orgId: currentOrg.id,
                        projectId: currentProject.id,
                        discoveryType: source.discoveryType,
                        discoverySourceId: source.id
                      }
                    })
                  }
                >
                  <TableCell className="font-medium">{source.name}</TableCell>
                  <TableCell className="text-muted">
                    {(source.discoveryConfiguration?.domainFQDN as string) || "-"}
                  </TableCell>
                  <TableCell className="text-muted capitalize">{source.schedule ?? "-"}</TableCell>
                  <TableCell className="text-muted">{source.totalResources}</TableCell>
                  <TableCell className="text-muted">{source.totalAccounts}</TableCell>
                  <TableCell className="text-muted">{source.totalDependencies}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_MAP[source.status] || "info"}>
                      {source.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted">
                    {source.lastRunAt
                      ? format(new Date(source.lastRunAt), "MMM d, yyyy HH:mm")
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="xs" onClick={(e) => e.stopPropagation()}>
                          <EllipsisVerticalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent sideOffset={2} align="end">
                        <ProjectPermissionCan
                          I={ProjectPermissionPamDiscoveryActions.RunScan}
                          a={ProjectPermissionSub.PamDiscovery}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              isDisabled={!isAllowed}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTriggerScan(source);
                              }}
                            >
                              <PlayIcon className="size-4" />
                              Trigger Scan
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionPamDiscoveryActions.Delete}
                          a={ProjectPermissionSub.PamDiscovery}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              isDisabled={!isAllowed}
                              variant="danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("deleteSource", source);
                              }}
                            >
                              <TrashIcon className="size-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {Boolean(totalCount) && !isPending && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
      </div>

      <PamAddDiscoverySourceModal
        isOpen={popUp.addSource.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addSource", isOpen)}
        projectId={projectId}
      />

      <DeleteActionModal
        isOpen={popUp.deleteSource.isOpen}
        title={`Delete discovery source "${(popUp.deleteSource.data as TPamDiscoverySource)?.name}"?`}
        subTitle="This will permanently remove this discovery source and all its run history."
        onChange={(isOpen) => handlePopUpToggle("deleteSource", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDelete}
      />
    </div>
  );
};
