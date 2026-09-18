import { ReactNode, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  BanIcon,
  ChevronDownIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RouteIcon,
  TrashIcon,
  TriangleAlertIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CopyButton,
  DeleteConfirmDialog,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  PageHeader,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useResetPageHelper } from "@app/hooks";
import {
  AgentVaultTrafficPolicy,
  useDeleteAgentVaultProxy,
  useListAgentVaultProxies,
  useReissueAgentVaultProxyEnrollmentToken,
  useRevokeAgentVaultProxyAccess
} from "@app/hooks/api/agentVault";
import { TAgentVaultEnrollment, TAgentVaultProxy } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { AgentVaultDocsUrls } from "../agent-vault-docs-urls";
import { ProxyEnrollmentDialog } from "./components/ProxyEnrollmentDialog";
import { ProxyFormDialog } from "./components/ProxyFormDialog";
import { ProxyStatusBadge } from "./components/ProxyStatusBadge";

const allowedHostsOf = (proxy: TAgentVaultProxy) =>
  proxy.allowedHosts
    ? proxy.allowedHosts
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean)
    : [];

const TrafficPolicyCell = ({ proxy }: { proxy: TAgentVaultProxy }) => {
  const isBundleOnly = proxy.trafficPolicy === AgentVaultTrafficPolicy.BundleHosts;
  const allowedHosts = isBundleOnly ? allowedHostsOf(proxy) : [];

  const cell = (
    <span>
      {isBundleOnly ? "Access bundle hosts only" : "Any host"}
      {allowedHosts.length > 0 &&
        ` · ${allowedHosts.length} ${allowedHosts.length === 1 ? "exception" : "exceptions"}`}
    </span>
  );

  if (allowedHosts.length === 0) return cell;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{cell}</TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <ul className="font-mono text-xs">
          {allowedHosts.map((host) => (
            <li key={host}>{host}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
};

const HeadWithHint = ({ hint, children }: { hint: string; children: ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="cursor-help underline decoration-muted decoration-dotted underline-offset-4">
        {children}
      </span>
    </TooltipTrigger>
    <TooltipContent className="max-w-xs">{hint}</TooltipContent>
  </Tooltip>
);

// The values are the API's orderBy vocabulary, so the table header and the query cannot drift.
enum SortColumn {
  Name = "name",
  Created = "createdAt"
}

const truncateFingerprint = (fingerprint: string) =>
  `${fingerprint.split(":").slice(0, 5).join(":")}…`;

export const AgentVaultProxiesPage = () => {
  const { t } = useTranslation();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const [sortColumn, setSortColumn] = useState(SortColumn.Created);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("descending");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultProxiesTable", PreferenceKey.PerPage, 20)
  );

  const { data, isPending } = useListAgentVaultProxies({
    orderBy: sortColumn,
    orderDirection: sortDirection === "ascending" ? "asc" : "desc",
    limit: perPage,
    offset: (page - 1) * perPage
  });

  const displayed = data?.proxies ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });
  const deleteProxy = useDeleteAgentVaultProxy();
  const revokeProxy = useRevokeAgentVaultProxyAccess();
  const reissueToken = useReissueAgentVaultProxyEnrollmentToken();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [proxyToEdit, setProxyToEdit] = useState<TAgentVaultProxy | null>(null);
  const [proxyToDelete, setProxyToDelete] = useState<TAgentVaultProxy | null>(null);
  const [proxyToRevoke, setProxyToRevoke] = useState<TAgentVaultProxy | null>(null);
  const [proxyToReissue, setProxyToReissue] = useState<TAgentVaultProxy | null>(null);
  const [enrollment, setEnrollment] = useState<TAgentVaultEnrollment | null>(null);

  const handleSort = (column: SortColumn, direction: "ascending" | "descending" | "none") => {
    setPage(1);
    if (direction === "none") {
      setSortColumn(SortColumn.Created);
      setSortDirection("descending");
      return;
    }
    setSortColumn(column);
    setSortDirection(direction);
  };

  const sortIconClassName = (column: SortColumn) =>
    twMerge(
      "size-3 transition-transform",
      sortColumn === column && sortDirection === "descending" && "rotate-180",
      sortColumn !== column && "opacity-30"
    );

  const handleDelete = async () => {
    try {
      if (!proxyToDelete) return;
      await deleteProxy.mutateAsync(proxyToDelete.id);
      createNotification({ text: `Proxy "${proxyToDelete.name}" deleted`, type: "success" });
      setProxyToDelete(null);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  const handleRevoke = async () => {
    if (!proxyToRevoke) return;

    try {
      await revokeProxy.mutateAsync(proxyToRevoke.id);
      createNotification({ text: `Proxy "${proxyToRevoke.name}" revoked`, type: "success" });
      setProxyToRevoke(null);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  const handleReissue = async () => {
    if (!proxyToReissue) return;

    try {
      const result = await reissueToken.mutateAsync(proxyToReissue.id);
      setProxyToReissue(null);
      setEnrollment(result);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
      <Helmet>
        <title>{t("common.head-title", { title: "Proxies" })}</title>
      </Helmet>
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={RouteIcon}
        title="Proxies"
        description="Manage the proxies your agents route their requests through."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Proxies
            <DocumentationLinkBadge href={AgentVaultDocsUrls.proxies} />
          </CardTitle>
          <CardDescription>An agent points its HTTP traffic at one of these.</CardDescription>
          {isAdmin && (
            <CardAction>
              <Button variant="av" onClick={() => setIsCreateOpen(true)}>
                <PlusIcon />
                Create Proxy
              </Button>
            </CardAction>
          )}
        </CardHeader>

        {!isPending && totalCount === 0 ? (
          <CardContent>
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No proxies yet</EmptyTitle>
                <EmptyDescription>
                  Create a proxy and enroll it where agent traffic leaves your network.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  sortDirection={sortColumn === SortColumn.Name ? sortDirection : "none"}
                  onSortChange={(direction) => handleSort(SortColumn.Name, direction)}
                >
                  Name
                  <ChevronDownIcon className={sortIconClassName(SortColumn.Name)} />
                </TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && (
                  <TableHead>
                    <HeadWithHint hint="Which hosts an agent may reach through this proxy.">
                      Traffic Policy
                    </HeadWithHint>
                  </TableHead>
                )}
                <TableHead>
                  <HeadWithHint hint="Pass it to infisical agent-vault run --ca-fingerprint so the agent refuses any proxy but this one.">
                    Certificate Authority
                  </HeadWithHint>
                </TableHead>
                {isAdmin && (
                  <TableHead
                    sortDirection={sortColumn === SortColumn.Created ? sortDirection : "none"}
                    onSortChange={(direction) => handleSort(SortColumn.Created, direction)}
                  >
                    Created
                    <ChevronDownIcon className={sortIconClassName(SortColumn.Created)} />
                  </TableHead>
                )}
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 3 }).map((_, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <TableRow key={`proxy-skeleton-${index}`}>
                    {Array.from({ length: isAdmin ? 6 : 4 }).map((__, cell) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <TableCell key={`proxy-skeleton-${index}-${cell}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isPending &&
                displayed.map((proxy) => (
                  <TableRow key={proxy.id}>
                    <TableCell>{proxy.name}</TableCell>
                    <TableCell>
                      <ProxyStatusBadge proxy={proxy} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <TrafficPolicyCell proxy={proxy} />
                      </TableCell>
                    )}
                    <TableCell>
                      {proxy.rootCaFingerprint ? (
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs">
                                {truncateFingerprint(proxy.rootCaFingerprint)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{proxy.rootCaFingerprint}</TooltipContent>
                          </Tooltip>
                          <CopyButton
                            value={proxy.rootCaFingerprint}
                            ariaLabel="Copy certificate authority fingerprint"
                            variant="ghost"
                            size="xs"
                          />
                        </div>
                      ) : (
                        <span className="text-muted">&mdash;</span>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {proxy.createdAt ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm">
                                {format(new Date(proxy.createdAt), "MMM d, yyyy")}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {format(new Date(proxy.createdAt), "MMM d, yyyy h:mm a")}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted">&mdash;</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell variant="action">
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton variant="ghost" size="xs" aria-label="Open proxy actions">
                              <MoreHorizontalIcon />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent sideOffset={2} align="end">
                            <DropdownMenuItem onClick={() => setProxyToEdit(proxy)}>
                              <PencilIcon />
                              Edit Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setProxyToReissue(proxy)}>
                              <RefreshCwIcon />
                              New Enrollment Token
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="danger"
                              onClick={() => setProxyToRevoke(proxy)}
                            >
                              <BanIcon />
                              Revoke Access
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="danger"
                              onClick={() => setProxyToDelete(proxy)}
                            >
                              <TrashIcon />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}

        {totalCount > 0 && (
          // The card lays its children out with gap-5, which reads as a gap under the table.
          <CardContent className="-mt-5 pt-0">
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={(newPerPage) => {
                setPerPage(newPerPage);
                setPage(1);
                setUserTablePreference("agentVaultProxiesTable", PreferenceKey.PerPage, newPerPage);
              }}
            />
          </CardContent>
        )}
      </Card>

      <ProxyFormDialog
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={setEnrollment}
      />

      <ProxyFormDialog
        isOpen={Boolean(proxyToEdit)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setProxyToEdit(null);
        }}
        proxy={proxyToEdit ?? undefined}
      />

      <ProxyEnrollmentDialog
        enrollment={enrollment}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEnrollment(null);
        }}
      />

      <AlertDialog
        open={Boolean(proxyToReissue)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setProxyToReissue(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TriangleAlertIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              New enrollment token for &quot;{proxyToReissue?.name}&quot;
            </AlertDialogTitle>
            <AlertDialogDescription>
              The proxy keeps serving until it re-enrolls with the new token. Re-enrolling gives it
              a new certificate authority, so every agent running through it has to trust the new
              one before its requests work again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="av"
              isPending={reissueToken.isPending}
              onClick={async (event) => {
                event.preventDefault();
                await handleReissue();
              }}
            >
              Generate Token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteConfirmDialog
        isOpen={Boolean(proxyToRevoke)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setProxyToRevoke(null);
        }}
        title={`Revoke "${proxyToRevoke?.name}"`}
        description="Its token stops working at its next poll. Every agent routed through it loses its credentials until the proxy enrolls again."
        confirmKey={proxyToRevoke?.name ?? ""}
        confirmLabel="Revoke Access"
        isPending={revokeProxy.isPending}
        onConfirm={handleRevoke}
      />

      <DeleteConfirmDialog
        isOpen={Boolean(proxyToDelete)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setProxyToDelete(null);
        }}
        title={`Delete "${proxyToDelete?.name}"`}
        description="Agents routed through it lose their credentials. This cannot be undone."
        confirmKey={proxyToDelete?.name ?? ""}
        isPending={deleteProxy.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
};
