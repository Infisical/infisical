import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import { BanIcon, PencilIcon } from "lucide-react";

import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { CodeBlock } from "@app/components/v4/ui/code-block";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { DetailLayout, Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Tabs } from "@app/components/v4/ui/tabs";
import { SmallText } from "@app/components/v4/ui/text";
import {
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import type { TGatewayEnrollmentToken } from "@app/hooks/api/gateways-v2/types";
import type { TRelayConnectedGateway } from "@app/hooks/api/relays/queries";
import type { TRelayWithAuthMethod } from "@app/hooks/api/relays/types";

import { Dash } from "../../access/org/detail-parts";
import { useOrgId, useOrgPermission } from "../../access/permissions";
import { saved, toast } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import {
  NetworkingAuthMethodForm,
  toNetworkingAuthMethodInput
} from "../../networking/auth-method-form";
import { ConfirmDialog } from "../../networking/confirm-dialog";
import { DeployRestricted, siteUrl, useEnrollmentExpiry } from "../../networking/deploy-parts";
import { isRelayHealthy, RelayHealth } from "../../networking/health";
import { TruncatedValue } from "../../networking/truncated-value";

const backHref = (orgId: string) => orgHref(orgId, "/networking?selectedTab=relays");

const dateTime = (value: string) => format(new Date(value), "PPpp");

const relative = (value: string) => formatDistanceToNow(new Date(value), { addSuffix: true });

const statusRank = (heartbeat?: string | null) => {
  if (!heartbeat) return 2;
  return isRelayHealthy(heartbeat) ? 0 : 1;
};

const EditHostDialog = ({
  relay,
  open,
  onOpenChange
}: {
  relay: TRelayWithAuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const updateRelay = useV4Adapter("networking").useUpdateRelay();
  const [host, setHost] = useState(relay.host);
  const trimmed = host.trim();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setHost(relay.host);
        onOpenChange(next);
      }}
    >
      <DialogContent pending={updateRelay.isPending}>
        <DialogHeader>
          <DialogTitle>Edit relay</DialogTitle>
        </DialogHeader>
        <form
          id="edit-relay-host"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!trimmed || trimmed === relay.host) return;
            try {
              await updateRelay.mutateAsync({ relayId: relay.id, host: trimmed });
              saved("Relay updated");
              onOpenChange(false);
            } catch {
              // The global mutation handler reports the API error.
            }
          }}
        >
          <Field label="Host">
            <Input
              autoFocus
              mono
              autoComplete="off"
              value={host}
              placeholder="10.0.0.5 or relay.example.com"
              onChange={(event) => setHost(event.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="edit-relay-host"
            loading={updateRelay.isPending}
            disabled={!trimmed || trimmed === relay.host}
          >
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type Enrollment = TGatewayEnrollmentToken & { relayId: string };

const RelayDeployCard = ({ relay }: { relay: TRelayWithAuthMethod }) => {
  const { permission } = useOrgPermission();
  const mint = useV4Adapter("networking").useMintRelayToken();
  const [deploymentMethod, setDeploymentMethod] = useState("cli");
  const [minted, setMinted] = useState<Enrollment | null>(null);
  const enrollment = minted?.relayId === relay.id ? minted : null;
  const { badge: expiryBadge, isExpired } = useEnrollmentExpiry(enrollment?.expiresAt);
  const canEdit = permission.can(OrgRelayPermissionActions.EditRelays, OrgPermissionSubjects.Relay);
  const { method } = relay.authMethod;

  if (method === "identity") return null;

  const isAws = method === "aws";
  const handleGenerate = async () => {
    try {
      const result = await mint.mutateAsync({ relayId: relay.id });
      setMinted({ ...result, relayId: relay.id });
    } catch {
      // The global mutation handler reports the API error.
    }
  };
  const enroll = isAws
    ? `--enroll-method=aws --relay-id=${relay.id}`
    : `--enroll-method=token --token=${enrollment?.token}`;
  const domain = `--domain=${siteUrl()}`;
  const blocks =
    deploymentMethod === "systemd"
      ? [
          {
            label: "Install service",
            code: `sudo infisical relay systemd install ${relay.name} ${enroll} ${domain}`,
            expiring: !isAws
          },
          { label: "Start service", code: `sudo systemctl start ${relay.name}`, expiring: false }
        ]
      : [
          {
            label: "Command",
            code: `infisical relay start --name=${relay.name} ${enroll} ${domain}`,
            expiring: !isAws
          }
        ];
  const showCommands = isAws || Boolean(enrollment);

  return (
    <Card
      variant="framed"
      title={
        <Inline gap={8} wrap={false}>
          Deployment
          <DocumentationLinkBadge href="https://infisical.com/docs/cli/overview" />
        </Inline>
      }
      action={
        canEdit && showCommands ? (
          <Tabs
            variant="segmented"
            label="Deployment method"
            value={deploymentMethod}
            onChange={setDeploymentMethod}
            tabs={[
              { value: "cli", label: "CLI" },
              { value: "systemd", label: "System service" }
            ]}
          />
        ) : undefined
      }
    >
      {canEdit ? (
        <Stack gap={16}>
          {showCommands &&
            blocks.map((block) => (
              <CodeBlock
                key={block.label}
                label={block.label}
                language="shell"
                wrap
                code={block.code}
                copyable={!(block.expiring && isExpired)}
                actions={block.expiring ? expiryBadge : undefined}
              />
            ))}
          {isAws && (
            <SmallText muted>Requires AWS credentials matching the configured allowlist.</SmallText>
          )}
          {!isAws && (
            <Inline gap={8}>
              <Button
                variant="outline"
                icon={enrollment ? "sync" : "terminal"}
                loading={mint.isPending}
                onClick={handleGenerate}
              >
                {enrollment ? "Regenerate command" : "Generate deploy command"}
              </Button>
            </Inline>
          )}
        </Stack>
      ) : (
        <DeployRestricted resource="relay" />
      )}
    </Card>
  );
};

const ConnectedGatewaysCard = ({ relayId }: { relayId: string }) => {
  const orgId = useOrgId();
  const go = useGo();
  const { data: gateways, isPending } = useV4Adapter("networking").useRelayGateways(relayId);
  const rows = [...(gateways ?? [])].sort(
    (a, b) => statusRank(a.heartbeat) - statusRank(b.heartbeat)
  );
  const columns: DataTableColumn<TRelayConnectedGateway>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      render: (row) => (
        <RowLink {...go.link(orgHref(orgId, `/networking/gateways/${row.id}`))} title={row.name}>
          {row.name}
        </RowLink>
      )
    },
    { id: "status", header: "Status", render: (row) => <RelayHealth heartbeat={row.heartbeat} /> },
    { id: "created", header: "Created", render: (row) => relative(row.createdAt) },
    {
      id: "lastSeen",
      header: "Last seen",
      render: (row) => (row.heartbeat ? relative(row.heartbeat) : <Dash />)
    }
  ];
  const empty = !isPending && rows.length === 0;
  return (
    <Card variant="framed" title="Connected gateways" flush={!empty}>
      {empty ? (
        <EmptyState
          size="sm"
          icon="globe"
          title="No connected gateways"
          description="Gateways that route through this relay will show up here."
        />
      ) : (
        <DataTable
          label="Connected gateways"
          rows={rows}
          columns={columns}
          loading={isPending}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
        />
      )}
    </Card>
  );
};

const AuthenticationCard = ({
  relay,
  canEdit
}: {
  relay: TRelayWithAuthMethod;
  canEdit: boolean;
}) => {
  const orgId = useOrgId();
  const updateRelay = useV4Adapter("networking").useUpdateRelay();
  const { authMethod } = relay;
  return (
    <Card variant="framed" title="Authentication">
      {authMethod.method === "identity" ? (
        <Stack gap={16}>
          <Alert tone="warn" title="Authenticated via machine identity (legacy)">
            <p>This relay is still using machine identity. We recommend creating a new relay.</p>
            <a href={backHref(orgId)}>Create a new relay</a>
          </Alert>
          {authMethod.config.identityName && (
            <DataList
              variant="props"
              density="compact"
              items={[["Machine identity", authMethod.config.identityName]]}
            />
          )}
        </Stack>
      ) : (
        <NetworkingAuthMethodForm
          currentMethod={authMethod}
          disabledReason={canEdit ? undefined : RESTRICTED}
          isPending={updateRelay.isPending}
          onUpdate={async (form) => {
            try {
              const input = toNetworkingAuthMethodInput(form);
              await updateRelay.mutateAsync({
                relayId: relay.id,
                authMethod: input.method === "aws" ? input : { method: "token" }
              });
              saved("Auth method updated");
              return true;
            } catch {
              return false;
            }
          }}
        />
      )}
    </Card>
  );
};

export const RelayDetailsByIDPage = () => {
  const { relayId } = useParams({
    from: v4Path("/organizations/$orgId/networking/relays/$relayId")
  });
  const orgId = useOrgId();
  const go = useGo();
  const networking = useV4Adapter("networking");
  const { permission, isPending: permissionPending } = useOrgPermission();
  const canList = permission.can(OrgRelayPermissionActions.ListRelays, OrgPermissionSubjects.Relay);
  const { data: relay, isPending } = networking.useRelay(relayId);
  const deleteRelay = networking.useDeleteRelay();
  const revokeRelay = networking.useRevokeRelay();
  const [dialog, setDialog] = useState<"host" | "revoke" | "delete">();

  if (permissionPending || (canList && isPending))
    return <Loader size="page" label="Loading relay" />;
  if (!canList) return <AccessRestricted requirement="list Relays" />;
  if (!relay)
    return (
      <EmptyState
        icon="globe"
        title="Relay not found"
        actions={
          <Button variant="outline" asChild>
            <a href={backHref(orgId)}>Back to relays</a>
          </Button>
        }
      />
    );

  const can = (action: OrgRelayPermissionActions) =>
    permission.can(action, OrgPermissionSubjects.Relay);
  const canEdit = can(OrgRelayPermissionActions.EditRelays);
  const canDelete = can(OrgRelayPermissionActions.DeleteRelays);
  const canRevoke = can(OrgRelayPermissionActions.RevokeRelayAccess);

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <Stack align="start">
          <Button variant="ghost" size="sm" icon="chev-left" asChild>
            <a href={backHref(orgId)}>Relays</a>
          </Button>
        </Stack>
        <PageHeader
          title={relay.name}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" iconRight="more">
                  Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(relay.id);
                    toast({ tone: "neutral", title: "Relay ID copied to clipboard" });
                  }}
                >
                  <Icon name="copy" />
                  Copy relay ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {relay.canRevoke && (
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!canRevoke}
                    description={canRevoke ? undefined : RESTRICTED}
                    onSelect={() => setDialog("revoke")}
                  >
                    <Icon icon={BanIcon} />
                    Revoke access
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete}
                  description={canDelete ? undefined : RESTRICTED}
                  onSelect={() => setDialog("delete")}
                >
                  <Icon name="trash" />
                  Delete relay
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </Stack>
      <DetailLayout
        asideLabel="Details"
        aside={
          <Stack gap={24}>
            <Card
              variant="framed"
              title="Details"
              action={
                <Button
                  variant="outline"
                  size="icon-xs"
                  aria-label="Edit relay host"
                  disabledReason={canEdit ? undefined : RESTRICTED}
                  onClick={() => setDialog("host")}
                >
                  <Icon icon={PencilIcon} size={12} />
                </Button>
              }
            >
              <DataList
                variant="props"
                density="compact"
                items={[
                  [
                    "ID",
                    <TruncatedValue
                      key="id"
                      value={relay.id}
                      copyLabel="Copy relay ID to clipboard"
                    />
                  ],
                  ["Host", <TruncatedValue key="host" value={relay.host} />],
                  ["Health", <RelayHealth key="health" heartbeat={relay.heartbeat} />],
                  [
                    "Last heartbeat",
                    relay.heartbeat ? dateTime(relay.heartbeat) : <Dash key="heartbeat" />,
                    { span: "half" }
                  ],
                  ["Created", dateTime(relay.createdAt), { span: "half" }]
                ]}
              />
            </Card>
            <AuthenticationCard relay={relay} canEdit={canEdit} />
          </Stack>
        }
      >
        <Stack gap={24}>
          <RelayDeployCard relay={relay} />
          <ConnectedGatewaysCard relayId={relay.id} />
        </Stack>
      </DetailLayout>
      <EditHostDialog
        relay={relay}
        open={dialog === "host"}
        onOpenChange={(open) => setDialog(open ? "host" : undefined)}
      />
      <ConfirmDialog
        open={dialog === "revoke"}
        onOpenChange={(open) => setDialog(open ? "revoke" : undefined)}
        title="Revoke relay access?"
        description="The relay will be disconnected and active tokens invalidated. It must re-authenticate to reconnect."
        confirmText={relay.name}
        action="Revoke access"
        onConfirm={async () => {
          await revokeRelay.mutateAsync({ relayId: relay.id });
          saved("Relay access revoked");
        }}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : undefined)}
        title="Delete relay?"
        description="This permanently removes the relay from your organization. Deleting it cannot be undone."
        confirmText={relay.name}
        action="Delete relay"
        onConfirm={async () => {
          await deleteRelay.mutateAsync(relay.id);
          saved("Successfully deleted relay");
          go(backHref(orgId));
        }}
      />
    </Stack>
  );
};
