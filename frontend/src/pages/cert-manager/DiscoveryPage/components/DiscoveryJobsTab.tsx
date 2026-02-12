import { useEffect, useState } from "react";
import {
  faEllipsis,
  faMagnifyingGlass,
  faPlus,
  faSyncAlt
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  Tag,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
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
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Discovery Jobs</h2>
          <p className="text-sm text-mineshaft-400">
            Configure and manage scans to discover certificates across your infrastructure.
          </p>
        </div>
        <ProjectPermissionCan
          I={ProjectPermissionPkiDiscoveryActions.Create}
          a={ProjectPermissionSub.PkiDiscovery}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("createJob")}
              isDisabled={!isAllowed}
            >
              Add Job
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="mb-4">
        <Input
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search by name, domain, or IP..."
          className="flex-1"
        />
      </div>

      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Target</Th>
              <Th>Ports</Th>
              <Th>Status</Th>
              <Th>Last Scan</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={6} innerKey="discovery-jobs" />}
            {!isPending && discoveries.length === 0 && (
              <Tr>
                <Td colSpan={6}>
                  <EmptyState title="No jobs found" />
                </Td>
              </Tr>
            )}
            {!isPending &&
              discoveries.map((discovery) => (
                <Tr
                  key={discovery.id}
                  className="cursor-pointer hover:bg-mineshaft-700"
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
                  <Td>{discovery.name}</Td>
                  <Td className="max-w-[200px] truncate">{getTargetDisplay(discovery)}</Td>
                  <Td>{renderPortsBadges(discovery)}</Td>
                  <Td>
                    {getDiscoveryStatusBadge(
                      discovery.lastScanStatus,
                      discovery.isActive,
                      Boolean(discovery.lastScanMessage)
                    )}
                  </Td>
                  <Td>
                    {discovery.lastScannedAt
                      ? format(new Date(discovery.lastScannedAt), "MMM dd, yyyy HH:mm")
                      : "Never"}
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="plain" colorSchema="secondary" size="xs">
                          <FontAwesomeIcon icon={faEllipsis} />
                        </Button>
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
                              <FontAwesomeIcon icon={faSyncAlt} className="mr-2" />
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
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </TableContainer>

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
    </div>
  );
};
