import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { MoreHorizontalIcon, PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { HoverCard, HoverCardContent, HoverCardTrigger, Tag } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
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
import {
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionSub,
  useOrganization
} from "@app/context";
import {
  PkiDiscoveryScanStatus,
  TPkiDiscovery,
  useDeletePkiDiscovery,
  useListPkiDiscoveries,
  useTriggerPkiDiscoveryScan
} from "@app/hooks/api";
import { useDebounce } from "@app/hooks/useDebounce";
import { usePopUp } from "@app/hooks/usePopUp";
import { getDiscoveryStatusBadge, parsePorts } from "@app/pages/cert-manager/pki-discovery-utils";

import { DeleteDiscoveryModal } from "./DeleteDiscoveryModal";
import { DiscoveryJobModal } from "./DiscoveryJobModal";

type Props = {
  projectId: string;
};

const PAGE_SIZE = 25;
const MAX_PORTS_TO_SHOW = 2;

export const DiscoveryJobsTab = ({ projectId }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [page, setPage] = useState(1);
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchFilter, 300);

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "createJob",
    "editJob",
    "deleteJob"
  ] as const);

  const { data, isPending } = useListPkiDiscoveries({
    projectId,
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const triggerScan = useTriggerPkiDiscoveryScan();
  const deleteDiscovery = useDeletePkiDiscovery();

  const discoveries = data?.discoveries || [];
  const totalCount = data?.totalCount || 0;

  const handleTriggerScan = async (discovery: TPkiDiscovery) => {
    try {
      await triggerScan.mutateAsync({ discoveryId: discovery.id, projectId });
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async (): Promise<void> => {
    const discovery = popUp.deleteJob.data as TPkiDiscovery;
    await deleteDiscovery.mutateAsync({ discoveryId: discovery.id });
    handlePopUpClose("deleteJob");
  };

  const getTargetDisplay = (discovery: TPkiDiscovery) => {
    const targets: string[] = [];
    if (discovery.targetConfig.domains?.length) {
      targets.push(...discovery.targetConfig.domains.slice(0, 2));
    }
    if (discovery.targetConfig.ipRanges?.length) {
      targets.push(...discovery.targetConfig.ipRanges.slice(0, 2));
    }
    const display = targets.slice(0, 2).join(", ");
    const total =
      (discovery.targetConfig.domains?.length || 0) +
      (discovery.targetConfig.ipRanges?.length || 0);
    return total > 2 ? `${display} +${total - 2} more` : display;
  };

  const renderPortsBadges = (discovery: TPkiDiscovery) => {
    const ports = parsePorts(discovery.targetConfig.ports);

    if (ports.length === 0) {
      return <Tag>443</Tag>;
    }

    const visiblePorts = ports.slice(0, MAX_PORTS_TO_SHOW);
    const remainingPorts = ports.slice(MAX_PORTS_TO_SHOW);

    return (
      <div className="flex items-center gap-1">
        {visiblePorts.map((port) => (
          <Tag key={port}>{port}</Tag>
        ))}
        {remainingPorts.length > 0 && (
          <HoverCard>
            <HoverCardTrigger>
              <Tag>+{remainingPorts.length}</Tag>
            </HoverCardTrigger>
            <HoverCardContent className="border border-gray-700 bg-mineshaft-800 p-3">
              <div className="flex flex-wrap gap-1">
                {remainingPorts.map((port) => (
                  <Tag key={port}>{port}</Tag>
                ))}
              </div>
            </HoverCardContent>
          </HoverCard>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discovery Jobs</CardTitle>
        <CardDescription>
          Configure scans to run on a schedule and find certificates on the domains and IP addresses
          you select.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionPkiDiscoveryActions.Create}
            a={ProjectPermissionSub.PkiDiscovery}
          >
            {(isAllowed) => (
              <Button
                variant="project"
                onClick={() => handlePopUpOpen("createJob")}
                isDisabled={!isAllowed}
              >
                <PlusIcon />
                Add Job
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search by name, domain, or IP…"
            />
          </InputGroup>
        </div>

        {/* eslint-disable-next-line no-nested-ternary */}
        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : discoveries.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No discovery jobs defined</EmptyTitle>
              <EmptyDescription>
                Define a job to scan domains or IP ranges and surface the certificates running on
                them.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Ports</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Scan</TableHead>
                  <TableHead className="w-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {discoveries.map((discovery) => (
                  <TableRow
                    key={discovery.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/organizations/$orgId/projects/cert-manager/$projectId/discovery/$discoveryId",
                        params: {
                          orgId: currentOrg.id,
                          projectId,
                          discoveryId: discovery.id
                        }
                      })
                    }
                  >
                    <TableCell>{discovery.name}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {getTargetDisplay(discovery)}
                    </TableCell>
                    <TableCell>{renderPortsBadges(discovery)}</TableCell>
                    <TableCell>
                      {getDiscoveryStatusBadge(
                        discovery.lastScanStatus,
                        discovery.isActive,
                        Boolean(discovery.lastScanMessage)
                      )}
                    </TableCell>
                    <TableCell>
                      {discovery.lastScannedAt
                        ? format(new Date(discovery.lastScannedAt), "MMM dd, yyyy HH:mm")
                        : "Never"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton variant="ghost" size="xs">
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <ProjectPermissionCan
                            I={ProjectPermissionPkiDiscoveryActions.RunScan}
                            a={ProjectPermissionSub.PkiDiscovery}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={
                                  !isAllowed ||
                                  !discovery.isActive ||
                                  discovery.lastScanStatus === PkiDiscoveryScanStatus.Running ||
                                  discovery.lastScanStatus === PkiDiscoveryScanStatus.Pending
                                }
                                onClick={() => handleTriggerScan(discovery)}
                              >
                                <RefreshCwIcon />
                                Run Scan
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionPkiDiscoveryActions.Edit}
                            a={ProjectPermissionSub.PkiDiscovery}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("editJob", discovery)}
                              >
                                Edit
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionPkiDiscoveryActions.Delete}
                            a={ProjectPermissionSub.PkiDiscovery}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("deleteJob", discovery)}
                              >
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

            {totalCount > PAGE_SIZE && (
              <div className="mt-4 flex justify-end">
                <Pagination
                  count={totalCount}
                  page={page}
                  perPage={PAGE_SIZE}
                  onChangePage={setPage}
                  onChangePerPage={() => {}}
                />
              </div>
            )}
          </>
        )}
      </CardContent>

      <DiscoveryJobModal
        isOpen={popUp.createJob.isOpen}
        onClose={() => handlePopUpClose("createJob")}
        projectId={projectId}
      />

      <DiscoveryJobModal
        isOpen={popUp.editJob.isOpen}
        onClose={() => handlePopUpClose("editJob")}
        projectId={projectId}
        discovery={popUp.editJob.data as TPkiDiscovery | undefined}
      />

      <DeleteDiscoveryModal
        isOpen={popUp.deleteJob.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteJob", isOpen)}
        onConfirm={handleDelete}
        discoveryName={(popUp.deleteJob.data as TPkiDiscovery)?.name || ""}
      />
    </Card>
  );
};
