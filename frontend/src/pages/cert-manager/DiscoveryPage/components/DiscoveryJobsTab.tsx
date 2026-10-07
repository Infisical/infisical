import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { MoreHorizontalIcon, PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ProjectPermissionCan } from "@app/components/permissions";
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
  OverflowBadgeList,
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
  useOrganization,
  useSubscription
} from "@app/context";
import { PKI_DISCOVERY_TYPE_MAP } from "@app/helpers/pkiDiscovery";
import {
  PkiDiscoveryScanStatus,
  PkiDiscoveryType,
  TPkiDiscovery,
  useDeletePkiDiscovery,
  useListPkiDiscoveries,
  useTriggerPkiDiscoveryScan
} from "@app/hooks/api";
import { useDebounce } from "@app/hooks/useDebounce";
import { usePopUp } from "@app/hooks/usePopUp";
import {
  getDiscoveryStatusBadge,
  getItemLabel,
  parsePorts
} from "@app/pages/cert-manager/pki-discovery-utils";

import { DiscoveryTypeIcon } from "./DiscoveryJobSheet/DiscoveryTypeIcon";
import { DeleteDiscoveryModal } from "./DeleteDiscoveryModal";
import { DiscoveryJobSheet } from "./DiscoveryJobSheet";

type Props = {
  projectId: string;
};

const PAGE_SIZE = 25;

const getScopeItems = (discovery: TPkiDiscovery) => {
  if (discovery.discoveryType === PkiDiscoveryType.LinuxServer) {
    return discovery.targetConfig.searchFolderPaths ?? [];
  }
  const ports = parsePorts(discovery.targetConfig.ports);
  return ports.length ? ports : ["443"];
};

const getTargetItems = (discovery: TPkiDiscovery) => {
  if (discovery.discoveryType === PkiDiscoveryType.LinuxServer) {
    return (discovery.connections ?? []).map((connection) => connection.name);
  }
  return [...(discovery.targetConfig.domains ?? []), ...(discovery.targetConfig.ipRanges ?? [])];
};

export const DiscoveryJobsTab = ({ projectId }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [page, setPage] = useState(1);
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchFilter, 300);

  const { subscription } = useSubscription();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "createJob",
    "editJob",
    "deleteJob",
    "upgradePlan"
  ] as const);

  const handleCreateJob = () => {
    if (!subscription.pkiDiscovery) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true,
        text: "Certificate discovery is available on Infisical's Enterprise plan."
      });
      return;
    }
    handlePopUpOpen("createJob");
  };

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discovery Jobs</CardTitle>
        <CardDescription>
          Configure scans to find certificates served on your network or stored in files on your
          servers.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionPkiDiscoveryActions.Create}
            a={ProjectPermissionSub.PkiDiscovery}
          >
            {(isAllowed) => (
              <Button variant="project" onClick={handleCreateJob} isDisabled={!isAllowed}>
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
              placeholder="Search by name or description…"
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
                Define a job to scan your network or your servers and surface the certificates it
                finds.
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
                  <TableHead>Target</TableHead>
                  <TableHead>Ports / Folders</TableHead>
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
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <DiscoveryTypeIcon type={discovery.discoveryType} className="size-4" />
                        {PKI_DISCOVERY_TYPE_MAP[discovery.discoveryType]?.name}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <OverflowBadgeList
                        items={getTargetItems(discovery)}
                        getKey={getItemLabel}
                        getLabel={getItemLabel}
                      />
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <OverflowBadgeList
                        items={getScopeItems(discovery)}
                        getKey={getItemLabel}
                        getLabel={getItemLabel}
                      />
                    </TableCell>
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

      <DiscoveryJobSheet
        isOpen={popUp.createJob.isOpen}
        onClose={() => handlePopUpClose("createJob")}
        projectId={projectId}
      />

      <DiscoveryJobSheet
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

      <UpgradePlanModal
        paywallKey="cert-manager.discovery-jobs"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { text: string })?.text}
      />
    </Card>
  );
};
