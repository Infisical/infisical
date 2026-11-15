import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RadioGroup, RadioGroupItem } from "@infisical/cipher/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@infisical/cipher/ui/tabs";
import { Meta } from "@infisical/cipher/ui/text";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict } from "date-fns";
import { BanIcon, PencilIcon, RefreshCwIcon } from "lucide-react";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import { agentVaultDescriptionSchema } from "@app/helpers/agentVaultDescription";
import { addHostListIssues } from "@app/helpers/agentVaultHostPattern";
import { downloadTxtFile } from "@app/helpers/download";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { AgentVaultTrafficPolicy, isServiceHostsPolicy } from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultProxy, TAgentVaultProxyToken } from "@app/hooks/api/agentVault/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { useResetPageHelper } from "@app/hooks/useResetPageHelper";
import { slugSchema } from "@app/lib/schemas";

import { CopyButton } from "../../access/org/detail-parts";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { AgentVaultDocs, useIsAgentVaultAdmin } from "../resources/agent-vault-utils";
import { DateCell, Dash } from "../resources/shared";

import css from "../resources/resources.module.css";

const route = v4Path("/organizations/$orgId/projects/agent-vault/$projectId/proxies");
const TABLE = "agentVaultProxiesTable";

const cliCommand = (token: string, siteUrl: string) =>
  `INFISICAL_AGENT_VAULT_PROXY_TOKEN=${token} \\
infisical agent-vault proxy \\
  --domain ${siteUrl}`;

const systemdEnvFile = (token: string) => `INFISICAL_AGENT_VAULT_PROXY_TOKEN=${token}`;

const systemdUnit = (siteUrl: string) =>
  `[Unit]
Description=Infisical Agent Vault proxy
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=/etc/infisical/agent-vault-proxy.env
ExecStart=/usr/local/bin/infisical agent-vault proxy --domain ${siteUrl}
Restart=always

[Install]
WantedBy=multi-user.target`;

const dockerCommand = (token: string, siteUrl: string) =>
  `docker run -d --name agent-vault-proxy \\
  -p 17323:17323 \\
  -v agent-vault-proxy:/etc/infisical/agent-vault \\
  -e INFISICAL_AGENT_VAULT_PROXY_TOKEN=${token} \\
  infisical/cli agent-vault proxy \\
  --domain ${siteUrl}`;

const kubernetesManifest = (token: string, siteUrl: string) =>
  `apiVersion: v1
kind: Secret
metadata:
  name: agent-vault-proxy
type: Opaque
stringData:
  INFISICAL_AGENT_VAULT_PROXY_TOKEN: ${token}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-vault-proxy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: agent-vault-proxy
  template:
    metadata:
      labels:
        app: agent-vault-proxy
    spec:
      containers:
        - name: agent-vault-proxy
          image: infisical/cli
          args: ["agent-vault", "proxy", "--domain", "${siteUrl}"]
          envFrom:
            - secretRef:
                name: agent-vault-proxy
          ports:
            - containerPort: 17323`;

const settingsSchema = z
  .object({
    name: slugSchema({ max: 64, field: "Name" }),
    description: agentVaultDescriptionSchema,
    trafficPolicy: z.nativeEnum(AgentVaultTrafficPolicy),
    allowedHosts: z.string().trim().max(1024),
    pollInterval: z
      .string()
      .refine((value) => value.trim() !== "", "Poll interval is required")
      .pipe(
        z.coerce
          .number({ invalid_type_error: "Poll interval is required" })
          .int("Poll interval must be a whole number of seconds")
          .min(10, "Poll interval must be at least 10 seconds")
          .max(300, "Poll interval must be at most 300 seconds")
      )
  })
  .superRefine((data, ctx) => {
    if (data.trafficPolicy !== AgentVaultTrafficPolicy.ServiceHosts) return;
    addHostListIssues(data.allowedHosts, ctx, ["allowedHosts"]);
  });

const TRAFFIC_CHOICES = [
  {
    value: AgentVaultTrafficPolicy.AnyHost,
    title: "Any host",
    description: "Allow requests to reach any host."
  },
  {
    value: AgentVaultTrafficPolicy.ServiceHosts,
    title: "Service hosts only",
    description: "Only allow requests to reach hosts that the session's services cover."
  }
];

const allowedHostsOf = (proxy: TAgentVaultProxy) =>
  proxy.allowedHosts
    ? proxy.allowedHosts
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean)
    : [];

const truncateFingerprint = (fingerprint: string) =>
  `${fingerprint.split(":").slice(0, 5).join(":")}...`;

const Status = ({ proxy }: { proxy: TAgentVaultProxy }) => {
  if (!proxy.heartbeat)
    return (
      <Badge tone="soft" dot>
        Not connected
      </Badge>
    );
  const heartbeat = new Date(proxy.heartbeat);
  return (
    <Tooltip
      content={`Last seen ${formatDistanceToNowStrict(heartbeat)} ago, ${format(heartbeat, "MMM d, yyyy h:mm a")}`}
    >
      <Badge tone={proxy.isHealthy ? "ok" : "warn"} dot tabIndex={0}>
        {proxy.isHealthy ? "Healthy" : "Unreachable"}
      </Badge>
    </Tooltip>
  );
};

const TrafficPolicy = ({ proxy }: { proxy: TAgentVaultProxy }) => {
  const isServiceHostsOnly = isServiceHostsPolicy(proxy.trafficPolicy);
  const allowedHosts = isServiceHostsOnly ? allowedHostsOf(proxy) : [];
  const label = `${isServiceHostsOnly ? "Service hosts only" : "Any host"}${
    allowedHosts.length
      ? `, ${allowedHosts.length} ${allowedHosts.length === 1 ? "exception" : "exceptions"}`
      : ""
  }`;
  if (!allowedHosts.length) return <span>{label}</span>;
  return (
    <Tooltip content={allowedHosts.join(", ")}>
      <Meta mono={false} tabIndex={0}>
        {label}
      </Meta>
    </Tooltip>
  );
};

const ProxySettingsDialog = ({
  projectId,
  proxy,
  onCreated,
  onOpenChange
}: {
  projectId: string;
  proxy?: TAgentVaultProxy;
  onCreated: (token: TAgentVaultProxyToken) => void;
  onOpenChange: (open: boolean) => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const create = resources.useCreateProxy(projectId);
  const update = resources.useUpdateProxy(projectId);
  const [draft, setDraft] = useState({
    name: proxy?.name ?? "",
    description: proxy?.description ?? "",
    trafficPolicy:
      proxy && !isServiceHostsPolicy(proxy.trafficPolicy)
        ? AgentVaultTrafficPolicy.AnyHost
        : AgentVaultTrafficPolicy.ServiceHosts,
    allowedHosts: proxy?.allowedHosts ?? "",
    pollInterval: String(proxy?.pollInterval ?? 60)
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof draft) => (value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  let saveDelayNote: string | undefined;
  if (proxy?.heartbeat)
    saveDelayNote = proxy.isHealthy
      ? "This proxy picks up the change on its next poll."
      : "This proxy is not connected right now. It picks up the change when it reconnects.";

  return (
    <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{proxy ? "Edit settings" : "Create proxy"}</DialogTitle>
        </DialogHeader>
        <form
          id="agent-vault-proxy"
          autoComplete="off"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = settingsSchema.safeParse(draft);
            if (!result.success) {
              const next: Record<string, string> = {};
              result.error.issues.forEach((issue) => {
                const key = String(issue.path[0]);
                next[key] = next[key] ?? issue.message;
              });
              setErrors(next);
              return;
            }
            const { data } = result;
            const settings = {
              trafficPolicy: data.trafficPolicy,
              allowedHosts: data.allowedHosts ? data.allowedHosts : null,
              pollInterval: data.pollInterval
            };
            setPending(true);
            try {
              if (proxy) {
                await update.mutateAsync({
                  proxyId: proxy.id,
                  name: data.name,
                  description: data.description || null,
                  ...settings
                });
                saved(`Proxy ${data.name} updated`);
                onOpenChange(false);
              } else {
                const created = await create.mutateAsync({
                  name: data.name,
                  description: data.description || undefined,
                  ...settings
                });
                saved(`Proxy ${data.name} created`);
                onOpenChange(false);
                onCreated(created);
              }
            } catch (error) {
              failed(`Failed to ${proxy ? "update" : "create"} proxy`, error);
            } finally {
              setPending(false);
            }
          }}
        >
          <Stack gap={16}>
            <Field label="Name" error={errors.name}>
              <Input
                autoFocus
                value={draft.name}
                maxLength={64}
                placeholder="egress-1"
                invalid={Boolean(errors.name)}
                onChange={(event) => set("name")(event.target.value)}
              />
            </Field>
            <Field label="Description" optional error={errors.description}>
              <Input
                value={draft.description}
                maxLength={256}
                placeholder="Egress for the staging cluster"
                invalid={Boolean(errors.description)}
                onChange={(event) => set("description")(event.target.value)}
              />
            </Field>
            <Field label="Traffic policy" group>
              <RadioGroup value={draft.trafficPolicy} onValueChange={set("trafficPolicy")}>
                {TRAFFIC_CHOICES.map((choice) => (
                  <RadioGroupItem
                    key={choice.value}
                    value={choice.value}
                    label={choice.title}
                    description={choice.description}
                  />
                ))}
              </RadioGroup>
            </Field>
            {draft.trafficPolicy === AgentVaultTrafficPolicy.ServiceHosts && (
              <Field
                label="Exceptions"
                optional
                description="Other hosts agents may reach, separated by commas."
                error={errors.allowedHosts}
              >
                <Input
                  mono
                  value={draft.allowedHosts}
                  placeholder="registry.npmjs.org, proxy.golang.org"
                  invalid={Boolean(errors.allowedHosts)}
                  onChange={(event) => set("allowedHosts")(event.target.value)}
                />
              </Field>
            )}
            <Field
              label="Poll interval"
              description="How often the proxy refreshes its configuration, in seconds."
              error={errors.pollInterval}
            >
              <Input
                inputMode="numeric"
                value={draft.pollInterval}
                invalid={Boolean(errors.pollInterval)}
                onChange={(event) => set("pollInterval")(event.target.value)}
              />
            </Field>
            {saveDelayNote && <Alert tone="info">{saveDelayNote}</Alert>}
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="agent-vault-proxy" loading={pending}>
            {proxy ? "Save" : "Create proxy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ProxyTokenDialog = ({
  proxyToken,
  onOpenChange
}: {
  proxyToken?: TAgentVaultProxyToken;
  onOpenChange: (open: boolean) => void;
}) => {
  const token = proxyToken?.proxyToken ?? "";
  const { protocol, hostname, port } = window.location;
  const siteUrl = `${protocol}//${hostname}${port && port !== "80" ? `:${port}` : ""}`;
  return (
    <Dialog open={Boolean(proxyToken)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Proxy token</DialogTitle>
          <DialogDescription>
            Start the proxy with this token. You can run it on as many machines as you need.
          </DialogDescription>
        </DialogHeader>
        <Stack gap={16}>
          <Alert tone="warn">
            This token is shown only once. It works until you rotate it or revoke the proxy&apos;s
            access.
          </Alert>
          <CodeBlock code={token} label="Proxy token" />
          <Tabs defaultValue="cli">
            <TabsList aria-label="Deployment target">
              <TabsTrigger value="cli">CLI</TabsTrigger>
              <TabsTrigger value="systemd">systemd</TabsTrigger>
              <TabsTrigger value="docker">Docker</TabsTrigger>
              <TabsTrigger value="kubernetes">Kubernetes</TabsTrigger>
            </TabsList>
            <TabsContent value="cli">
              <CodeBlock code={cliCommand(token, siteUrl)} label="Command" />
            </TabsContent>
            <TabsContent value="systemd">
              <Stack gap={8}>
                <CodeBlock
                  code={systemdEnvFile(token)}
                  label="/etc/infisical/agent-vault-proxy.env (chmod 600)"
                />
                <CodeBlock
                  code={systemdUnit(siteUrl)}
                  label="/etc/systemd/system/agent-vault-proxy.service"
                />
              </Stack>
            </TabsContent>
            <TabsContent value="docker">
              <CodeBlock code={dockerCommand(token, siteUrl)} label="Command" />
            </TabsContent>
            <TabsContent value="kubernetes">
              <CodeBlock code={kubernetesManifest(token, siteUrl)} label="Manifest" />
            </TabsContent>
          </Tabs>
        </Stack>
        <DialogFooter>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type TConfirm = {
  kind: "rotate" | "revoke" | "delete";
  proxy: TAgentVaultProxy;
};

const CONFIRM_COPY = {
  rotate: {
    title: (name: string) => `Rotate the token for ${name}?`,
    description:
      "The current token stops working, and the proxy gets a new certificate authority. Restart the proxy with the new token. Agents that pin the proxy's fingerprint need the new one.",
    action: "Rotate"
  },
  revoke: {
    title: (name: string) => `Revoke ${name}?`,
    description:
      "The proxy stops adding credentials to requests. To bring it back, rotate its token.",
    action: "Revoke access"
  },
  delete: {
    title: (name: string) => `Delete ${name}?`,
    description: "The proxy stops adding credentials to requests. This cannot be undone.",
    action: "Delete"
  }
};

const Proxies = ({ projectId }: { projectId: string }) => {
  const resources = useV4Adapter("agentVaultResources");
  const { isAdmin, isPending: isRolePending } = useIsAgentVaultAdmin(projectId);
  const [sort, setSort] = useState<{
    columnId: string;
    direction: "asc" | "desc";
  }>({
    columnId: "createdAt",
    direction: "desc"
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE, PreferenceKey.PerPage, 20)
  );
  const [dialog, setDialog] = useState<{ proxy?: TAgentVaultProxy }>();
  const [confirm, setConfirm] = useState<TConfirm>();
  const [proxyToken, setProxyToken] = useState<TAgentVaultProxyToken>();
  useAgentVaultCreateIntent(() => setDialog({}), isAdmin);

  const { data, isPending } = resources.useProxies(projectId, {
    orderBy: sort.columnId === "name" ? "name" : "createdAt",
    orderDirection: sort.direction,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const proxies = data?.proxies ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });
  const remove = resources.useDeleteProxy(projectId);
  const revoke = resources.useRevokeProxyAccess(projectId);
  const rotate = resources.useRotateProxyToken(projectId);
  const fetchCa = resources.useProxyCa();

  const downloadCa = async (proxy: TAgentVaultProxy) => {
    try {
      const ca = await fetchCa.mutateAsync(proxy.id);
      downloadTxtFile(`${proxy.name}-ca.pem`, ca.certificate);
    } catch (error) {
      failed("Failed to download the certificate authority", error);
    }
  };

  const columns: DataTableColumn<TAgentVaultProxy>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      minWidth: 200,
      text: (proxy) => proxy.name,
      render: (proxy) => (
        <Inline gap={8} align="center" wrap={false}>
          <span title={proxy.name} className={css.name}>
            {proxy.name}
          </span>
          {proxy.description && (
            <Meta mono={false} title={proxy.description} className={css.description}>
              {proxy.description}
            </Meta>
          )}
        </Inline>
      )
    },
    {
      id: "status",
      header: "Status",
      width: 136,
      render: (proxy) => <Status proxy={proxy} />
    },
    ...(isAdmin
      ? [
          {
            id: "trafficPolicy",
            header: "Traffic policy",
            width: 200,
            render: (proxy: TAgentVaultProxy) => <TrafficPolicy proxy={proxy} />
          } satisfies DataTableColumn<TAgentVaultProxy>
        ]
      : []),
    {
      id: "ca",
      header: "Certificate authority",
      width: 248,
      render: (proxy) =>
        proxy.rootCaFingerprint ? (
          <Inline gap={4} align="center" wrap={false}>
            <Tooltip content={proxy.rootCaFingerprint}>
              <Meta mono tabIndex={0}>
                {truncateFingerprint(proxy.rootCaFingerprint)}
              </Meta>
            </Tooltip>
            <CopyButton
              value={proxy.rootCaFingerprint}
              label="Copy certificate authority fingerprint"
            />
            <Tooltip content="Download certificate authority">
              <Button
                variant="ghost"
                size="icon-xs"
                iconOnly
                icon="download"
                onClick={(event) => {
                  event.stopPropagation();
                  downloadCa(proxy);
                }}
              >
                Download certificate authority
              </Button>
            </Tooltip>
          </Inline>
        ) : (
          <Dash />
        )
    },
    ...(isAdmin
      ? [
          {
            id: "createdAt",
            header: "Created",
            sortable: true,
            width: 128,
            render: (proxy: TAgentVaultProxy) =>
              proxy.createdAt ? <DateCell value={proxy.createdAt} /> : <Dash />
          } satisfies DataTableColumn<TAgentVaultProxy>
        ]
      : [])
  ];

  const rowActions: DataTableRowActions<TAgentVaultProxy> | undefined = isAdmin
    ? {
        menuLabel: "Proxy options",
        inline: [
          {
            label: "Edit settings",
            icon: PencilIcon,
            onSelect: (proxy) => setDialog({ proxy })
          }
        ],
        renderMenu: (proxy) => (
          <>
            <DropdownMenuItem onSelect={() => setConfirm({ kind: "rotate", proxy })}>
              <Icon icon={RefreshCwIcon} />
              Rotate proxy token
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirm({ kind: "revoke", proxy })}
            >
              <Icon icon={BanIcon} />
              Revoke access
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirm({ kind: "delete", proxy })}
            >
              <Icon name="trash" />
              Delete proxy
            </DropdownMenuItem>
          </>
        )
      }
    : undefined;

  const runConfirm = async ({ kind, proxy }: TConfirm) => {
    try {
      if (kind === "rotate") {
        const result = await rotate.mutateAsync(proxy.id);
        setProxyToken(result);
      } else if (kind === "revoke") {
        await revoke.mutateAsync(proxy.id);
        saved(`Proxy ${proxy.name} revoked`);
      } else {
        await remove.mutateAsync(proxy.id);
        saved(`Proxy ${proxy.name} deleted`);
      }
    } catch (error) {
      failed(`Failed to ${kind === "rotate" ? "rotate the proxy token" : `${kind} proxy`}`, error);
    }
    setConfirm(undefined);
  };

  return (
    <>
      <Stack gap={24}>
        <PageHeader
          title="Proxies"
          badges={<DocumentationLink href={AgentVaultDocs.proxies} subject="proxies" />}
          actions={
            isAdmin ? (
              <Button variant="accent" icon="plus" onClick={() => setDialog({})}>
                Create proxy
              </Button>
            ) : undefined
          }
        />
        <DataTable
          label="Proxies"
          rows={proxies}
          columns={columns}
          loading={isPending || isRolePending}
          getRowId={(proxy) => proxy.id}
          rowLabel={(proxy) => proxy.name}
          rowActions={rowActions}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          empty={
            <EmptyState
              size="sm"
              media="bare"
              icon="machine"
              title="No proxies yet"
              description="Create a proxy and start it where agent traffic leaves your network."
              actions={
                isAdmin ? (
                  <Button variant="outline" icon="plus" onClick={() => setDialog({})}>
                    Create proxy
                  </Button>
                ) : undefined
              }
            />
          }
          pagination={
            totalCount > 0 ? (
              <Pagination
                label="Proxy pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={totalCount}
                pageSize={perPage}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={(next) => {
                  setPerPage(next);
                  setPage(1);
                  setUserTablePreference(TABLE, PreferenceKey.PerPage, next);
                }}
              />
            ) : undefined
          }
        />
      </Stack>
      {dialog && (
        <ProxySettingsDialog
          key={dialog.proxy?.id ?? "new"}
          projectId={projectId}
          proxy={dialog.proxy}
          onCreated={setProxyToken}
          onOpenChange={(open) => !open && setDialog(undefined)}
        />
      )}
      <ProxyTokenDialog
        proxyToken={proxyToken}
        onOpenChange={(open) => !open && setProxyToken(undefined)}
      />
      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(undefined)}>
        <AlertDialogContent
          tone={confirm?.kind === "rotate" ? "neutral" : "danger"}
          confirmText={confirm && confirm.kind !== "rotate" ? confirm.proxy.name : undefined}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm ? CONFIRM_COPY[confirm.kind].title(confirm.proxy.name) : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm ? CONFIRM_COPY[confirm.kind].description : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => confirm && runConfirm(confirm)}>
              {confirm ? CONFIRM_COPY[confirm.kind].action : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const AgentVaultProxiesPage = () => {
  const { projectId } = useParams({ from: route });
  return (
    <TooltipProvider>
      <PageTitle title="Proxies" />
      <Proxies key={projectId} projectId={projectId} />
    </TooltipProvider>
  );
};
