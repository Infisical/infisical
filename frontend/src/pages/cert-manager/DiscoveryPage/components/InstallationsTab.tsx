import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { MoreHorizontalIcon, SearchIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Card,
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
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionSub,
  useOrganization
} from "@app/context";
import {
  TPkiInstallation,
  useDeletePkiInstallation,
  useListPkiInstallations
} from "@app/hooks/api";
import { PkiDiscoveryType } from "@app/hooks/api/pkiDiscovery/types";
import { useDebounce } from "@app/hooks/useDebounce";
import { usePopUp } from "@app/hooks/usePopUp";
import {
  canSetKeystorePassword,
  getEndpoint,
  getGatewayLabel,
  getKeystoreStatusBadge,
  isHostFileInstallation,
  useCanRescanPkiInstallations
} from "@app/pages/cert-manager/pki-discovery-utils";

import { DiscoveryTypeIcon } from "./DiscoveryJobSheet/DiscoveryTypeIcon";
import { DeleteInstallationModal } from "./DeleteInstallationModal";
import { EditInstallationModal } from "./EditInstallationModal";
import {
  RESCAN_POLL_INTERVAL_MS,
  RESCAN_POLL_TIMEOUT_MS,
  SetKeystorePasswordDialog
} from "./SetKeystorePasswordDialog";

type Props = {
  projectId: string;
};

const PAGE_SIZE = 25;

export const InstallationsTab = ({ projectId }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [page, setPage] = useState(1);
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchFilter, 300);

  const canRescanInstallations = useCanRescanPkiInstallations();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "editInstallation",
    "deleteInstallation",
    "setKeystorePassword"
  ] as const);

  const [pendingRescan, setPendingRescan] = useState<{
    installationId: string;
    previousCheckedAt?: string;
  } | null>(null);

  useEffect(() => {
    if (!pendingRescan) return undefined;
    const timeout = setTimeout(() => setPendingRescan(null), RESCAN_POLL_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [pendingRescan]);

  const { data, isPending } = useListPkiInstallations(
    {
      projectId,
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined
    },
    { refetchInterval: pendingRescan ? RESCAN_POLL_INTERVAL_MS : false }
  );

  useEffect(() => {
    if (!pendingRescan) return;
    const rescanned = data?.installations.find((item) => item.id === pendingRescan.installationId);
    if (rescanned && rescanned.metadata?.lastCheckedAt !== pendingRescan.previousCheckedAt) {
      setPendingRescan(null);
    }
  }, [data, pendingRescan]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const deleteInstallation = useDeletePkiInstallation();

  const installations = data?.installations || [];
  const totalCount = data?.totalCount || 0;

  const handleDelete = async (): Promise<void> => {
    const installation = popUp.deleteInstallation.data as TPkiInstallation;
    await deleteInstallation.mutateAsync({ installationId: installation.id, projectId });
    handlePopUpClose("deleteInstallation");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Installations</CardTitle>
        <CardDescription>
          Every place a certificate was found during a scan, identified by its host and port or its
          host and file path.
        </CardDescription>
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
              placeholder="Search by name, host, IP, domain, or path…"
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
        ) : installations.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No installations found</EmptyTitle>
              <EmptyDescription>
                Run a discovery job to surface the certificates currently served across your
                infrastructure.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Certs</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="w-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {installations.map((installation) => (
                  <TableRow
                    key={installation.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/organizations/$orgId/projects/cert-manager/$projectId/discovery/installations/$installationId",
                        params: {
                          orgId: currentOrg.id,
                          projectId,
                          installationId: installation.id
                        }
                      })
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <DiscoveryTypeIcon
                          type={
                            isHostFileInstallation(installation)
                              ? PkiDiscoveryType.LinuxServer
                              : PkiDiscoveryType.Network
                          }
                          className="size-4 shrink-0"
                        />
                        <span className="truncate">
                          {installation.name || getEndpoint(installation)}
                        </span>
                        {getKeystoreStatusBadge(installation)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {installation.primaryCertName || <span className="text-accent">—</span>}
                    </TableCell>
                    <TableCell>{getGatewayLabel(installation) || "N/A"}</TableCell>
                    <TableCell>
                      {installation.certificatesCount ?? installation.certificates?.length ?? 0}
                    </TableCell>
                    <TableCell>
                      {format(new Date(installation.lastSeenAt), "MMM dd, yyyy HH:mm")}
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
                            I={ProjectPermissionPkiCertificateInstallationActions.Edit}
                            a={ProjectPermissionSub.PkiCertificateInstallations}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("editInstallation", installation)}
                              >
                                Edit
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          {canSetKeystorePassword(installation) && (
                            <DropdownMenuItem
                              isDisabled={!canRescanInstallations}
                              onClick={() => handlePopUpOpen("setKeystorePassword", installation)}
                            >
                              {installation.hasKeystorePassword
                                ? "Change Password"
                                : "Set Password"}
                            </DropdownMenuItem>
                          )}
                          <ProjectPermissionCan
                            I={ProjectPermissionPkiCertificateInstallationActions.Delete}
                            a={ProjectPermissionSub.PkiCertificateInstallations}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("deleteInstallation", installation)}
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

      <EditInstallationModal
        isOpen={popUp.editInstallation.isOpen}
        onClose={() => handlePopUpClose("editInstallation")}
        projectId={projectId}
        installation={popUp.editInstallation.data as TPkiInstallation | undefined}
      />

      <SetKeystorePasswordDialog
        isOpen={popUp.setKeystorePassword.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setKeystorePassword", isOpen)}
        projectId={projectId}
        installation={popUp.setKeystorePassword.data as TPkiInstallation | undefined}
        onSaved={() => {
          const saved = popUp.setKeystorePassword.data as TPkiInstallation | undefined;
          if (saved) {
            setPendingRescan({
              installationId: saved.id,
              previousCheckedAt: saved.metadata?.lastCheckedAt
            });
          }
        }}
      />

      <DeleteInstallationModal
        isOpen={popUp.deleteInstallation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteInstallation", isOpen)}
        onConfirm={handleDelete}
        installationName={
          (popUp.deleteInstallation.data as TPkiInstallation)?.name ||
          (popUp.deleteInstallation.data as TPkiInstallation)?.locationDetails?.fqdn ||
          (popUp.deleteInstallation.data as TPkiInstallation)?.locationDetails?.ipAddress ||
          "this installation"
        }
      />
    </Card>
  );
};
