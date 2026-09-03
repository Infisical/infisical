import { ReactNode, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { MoreHorizontalIcon, RouteIcon, TriangleAlertIcon } from "lucide-react";

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
  Badge,
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
  OverflowBadgeList,
  PageHeader,
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
  AgentVaultUnmatchedHost,
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

// A column heading whose meaning is not obvious from its name, with the explanation on hover.
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

// Enough of the fingerprint to recognise, with the whole value behind the copy button.
const truncateFingerprint = (fingerprint: string) =>
  `${fingerprint.split(":").slice(0, 5).join(":")}…`;

export const AgentVaultProxiesPage = () => {
  const { t } = useTranslation();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const { data: proxies, isPending } = useListAgentVaultProxies();
  const deleteProxy = useDeleteAgentVaultProxy();
  const revokeProxy = useRevokeAgentVaultProxyAccess();
  const reissueToken = useReissueAgentVaultProxyEnrollmentToken();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [proxyToEdit, setProxyToEdit] = useState<TAgentVaultProxy | null>(null);
  const [proxyToDelete, setProxyToDelete] = useState<TAgentVaultProxy | null>(null);
  const [proxyToRevoke, setProxyToRevoke] = useState<TAgentVaultProxy | null>(null);
  const [proxyToReissue, setProxyToReissue] = useState<TAgentVaultProxy | null>(null);
  const [enrollment, setEnrollment] = useState<TAgentVaultEnrollment | null>(null);

  const handleDelete = async () => {
    if (!proxyToDelete) return;
    await deleteProxy.mutateAsync(proxyToDelete.id);
    createNotification({ text: `Proxy "${proxyToDelete.name}" deleted`, type: "success" });
    setProxyToDelete(null);
  };

  const handleRevoke = async () => {
    if (!proxyToRevoke) return;
    await revokeProxy.mutateAsync(proxyToRevoke.id);
    createNotification({ text: `Proxy "${proxyToRevoke.name}" revoked`, type: "success" });
    setProxyToRevoke(null);
  };

  const handleReissue = async () => {
    if (!proxyToReissue) return;
    const result = await reissueToken.mutateAsync(proxyToReissue.id);
    setProxyToReissue(null);
    setEnrollment(result);
  };

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: "Proxies" })}</title>
      </Helmet>
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={RouteIcon}
        title="Proxies"
        description="Where traffic leaves. Each proxy holds its own certificate authority."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Proxies
            <DocumentationLinkBadge href={AgentVaultDocsUrls.proxies} />
          </CardTitle>
          <CardDescription>
            An agent points its HTTP traffic at one of these. Settings reach a running proxy within
            one poll interval.
          </CardDescription>
          {isAdmin && (
            <CardAction>
              <Button variant="av" onClick={() => setIsCreateOpen(true)}>
                Create Proxy
              </Button>
            </CardAction>
          )}
        </CardHeader>

        {!isPending && (proxies?.length ?? 0) === 0 ? (
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
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && (
                  <TableHead>
                    <HeadWithHint hint="Connections to these hosts are passed straight through without being opened, so no credential is attached.">
                      Bypass Hosts
                    </HeadWithHint>
                  </TableHead>
                )}
                {isAdmin && (
                  <TableHead>
                    <HeadWithHint hint="What the agent may reach beyond the hosts its access bundles cover.">
                      Uncovered Hosts
                    </HeadWithHint>
                  </TableHead>
                )}
                <TableHead>Version</TableHead>
                <TableHead>Certificate Authority</TableHead>
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 3 }).map((_, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <TableRow key={`proxy-skeleton-${index}`}>
                    {Array.from({ length: isAdmin ? 7 : 5 }).map((__, cell) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <TableCell key={`proxy-skeleton-${index}-${cell}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isPending &&
                (proxies ?? []).map((proxy) => (
                  <TableRow key={proxy.id}>
                    <TableCell>{proxy.name}</TableCell>
                    <TableCell>
                      <ProxyStatusBadge proxy={proxy} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {proxy.bypassHosts ? (
                          <div className="max-w-72">
                            <OverflowBadgeList
                              items={proxy.bypassHosts.split(",").map((host) => host.trim())}
                              getKey={(host) => host}
                              getLabel={(host) => host}
                              getVariant={() => "neutral"}
                            />
                          </div>
                        ) : (
                          <span className="text-muted">&mdash;</span>
                        )}
                      </TableCell>
                    )}
                    {isAdmin && (
                      <TableCell>
                        <Badge
                          variant={
                            proxy.unmatchedHost === AgentVaultUnmatchedHost.Deny
                              ? "danger"
                              : "neutral"
                          }
                        >
                          {proxy.unmatchedHost === AgentVaultUnmatchedHost.Deny ? "Deny" : "Allow"}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      {proxy.version ?? <span className="text-muted">&mdash;</span>}
                    </TableCell>
                    <TableCell>
                      {proxy.rootCaFingerprint ? (
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs">
                                {truncateFingerprint(proxy.rootCaFingerprint)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {proxy.rootCaExpiresAt
                                ? `Expires ${format(new Date(proxy.rootCaExpiresAt), "MMM d, yyyy")}`
                                : proxy.rootCaFingerprint}
                            </TooltipContent>
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
                              Edit Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setProxyToReissue(proxy)}>
                              New Enrollment Token
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setProxyToRevoke(proxy)}>
                              Revoke Access
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setProxyToDelete(proxy)}>
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
              The running proxy keeps serving until the replacement enrolls. Enrolling replaces the
              proxy&apos;s certificate authority, which breaks anything holding a copy of the old
              one: explicit --ca-fingerprint pins, Kubernetes Secrets mounting the certificate, and
              macOS keychain entries that av run added.
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

      <AlertDialog
        open={Boolean(proxyToRevoke)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setProxyToRevoke(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TriangleAlertIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Revoke &quot;{proxyToRevoke?.name}&quot;</AlertDialogTitle>
            <AlertDialogDescription>
              Its token stops working at its next poll. Every agent routed through it loses its
              credentials until the proxy enrolls again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={revokeProxy.isPending}
              onClick={async (event) => {
                event.preventDefault();
                await handleRevoke();
              }}
            >
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
