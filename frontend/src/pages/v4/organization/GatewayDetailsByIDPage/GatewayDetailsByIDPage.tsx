import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import { BanIcon, HeartPulseIcon } from "lucide-react";

import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { TGatewayV2WithAuthMethod } from "@app/hooks/api/gateways-v2/types";
import {
  formatGatewayCliVersion,
  getGatewayTransportHealth,
  getLastSeenHeartbeat
} from "@app/hooks/api/gateways-v2/utils";

import { Dash } from "../../access/org/detail-parts";
import { useOrgId, useOrgPermission } from "../../access/permissions";
import { saved, toast } from "../../access/toast";
import { AccessRestricted, Muted, RESTRICTED } from "../../access/ui";
import { copyText } from "../../clipboard";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import {
  NetworkingAuthMethodForm,
  toNetworkingAuthMethodInput
} from "../../networking/auth-method-form";
import { ConfirmDialog } from "../../networking/confirm-dialog";
import { GatewayHealth, isGatewayRegistered } from "../../networking/health";
import { NameDialog } from "../../networking/name-dialog";
import { TruncatedValue } from "../../networking/truncated-value";
import { GatewayDeployCard } from "./deploy";
import { ConnectedResourcesCard } from "./resources";

const backHref = (orgId: string) => orgHref(orgId, "/networking?selectedTab=gateways");

const dateTime = (value: string) => format(new Date(value), "PPpp");

const CliVersion = ({ gateway }: { gateway: TGatewayV2WithAuthMethod }) => {
  if (gateway.cliVersionReportedAt && gateway.cliVersion)
    return (
      <Tooltip content={`Reported by the gateway on ${dateTime(gateway.cliVersionReportedAt)}.`}>
        <span>{formatGatewayCliVersion(gateway.cliVersion)}</span>
      </Tooltip>
    );
  if (gateway.cliVersionReportedAt)
    return (
      <Tooltip content="This gateway runs an Infisical CLI release that doesn't report its version. Upgrade it to v0.43.131 or later to see the exact version here.">
        <span>
          <Muted>Older than v0.43.131</Muted>
        </span>
      </Tooltip>
    );
  if (!isGatewayRegistered(gateway)) return <Dash />;
  return (
    <Tooltip content="The gateway hasn't reported its Infisical CLI version yet.">
      <span>
        <Dash />
      </span>
    </Tooltip>
  );
};

const Connection = ({ gateway }: { gateway: TGatewayV2WithAuthMethod }) => {
  const transports = getGatewayTransportHealth(gateway);
  if (!transports.length) return <Muted>Not configured</Muted>;
  return (
    <Stack gap={4}>
      {transports.map((transport) => (
        <Stack key={transport.transport} gap={4}>
          <StatusText
            reason={
              transport.probedAt ? `Last seen ${dateTime(transport.probedAt)}` : "Never reached"
            }
            tone={transport.isHealthy ? "ok" : "bad"}
            icon={transport.isHealthy ? "check-c" : "x"}
          >
            {transport.label}
          </StatusText>
          {transport.transport === "direct" && gateway.directAddress && (
            <TruncatedValue value={gateway.directAddress} />
          )}
        </Stack>
      ))}
    </Stack>
  );
};

const AuthenticationCard = ({
  gateway,
  canEdit
}: {
  gateway: TGatewayV2WithAuthMethod;
  canEdit: boolean;
}) => {
  const orgId = useOrgId();
  const updateGateway = useV4Adapter("networking").useUpdateGateway();
  const { authMethod } = gateway;
  return (
    <Card variant="framed" title="Authentication">
      {authMethod.method === "identity" ? (
        <Alert tone="warn" title="Authenticated via machine identity (legacy)">
          <p>This gateway is still using machine identity. We recommend creating a new gateway.</p>
          <a href={backHref(orgId)}>Create a new gateway</a>
        </Alert>
      ) : (
        <NetworkingAuthMethodForm
          currentMethod={authMethod}
          disabledReason={canEdit ? undefined : RESTRICTED}
          isPending={updateGateway.isPending}
          availableMethods={["token", "aws", "gcp", "kubernetes"]}
          currentGatewayId={gateway.id}
          onUpdate={async (form) => {
            try {
              await updateGateway.mutateAsync({
                gatewayId: gateway.id,
                authMethod: toNetworkingAuthMethodInput(form)
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

export const GatewayDetailsByIDPage = () => {
  const { gatewayId } = useParams({
    from: v4Path("/organizations/$orgId/networking/gateways/$gatewayId")
  });
  const orgId = useOrgId();
  const go = useGo();
  const networking = useV4Adapter("networking");
  const { permission, isPending: permissionPending } = useOrgPermission();
  const canList = permission.can(
    OrgGatewayPermissionActions.ListGateways,
    OrgPermissionSubjects.Gateway
  );
  const { data: gateway, isPending } = networking.useGateway(gatewayId);
  const updateGateway = networking.useUpdateGateway();
  const deleteGateway = networking.useDeleteGateway();
  const revokeGateway = networking.useRevokeGateway();
  const heartbeat = networking.useTriggerGatewayHeartbeat();
  const [dialog, setDialog] = useState<"rename" | "revoke" | "delete">();

  if (permissionPending || (canList && isPending))
    return <Loader size="page" label="Loading gateway" />;
  if (!canList) return <AccessRestricted requirement="list Gateways" />;
  if (!gateway)
    return (
      <EmptyState
        icon="server"
        title="Gateway not found"
        actions={
          <Button variant="outline" asChild>
            <a href={backHref(orgId)}>Back to gateways</a>
          </Button>
        }
      />
    );

  const can = (action: OrgGatewayPermissionActions) =>
    permission.can(action, OrgPermissionSubjects.Gateway);
  const canEdit = can(OrgGatewayPermissionActions.EditGateways);
  const canDelete = can(OrgGatewayPermissionActions.DeleteGateways);
  const canRevoke = can(OrgGatewayPermissionActions.RevokeGatewayAccess);
  const lastSeen = getLastSeenHeartbeat(gateway);

  const onHeartbeat = async () => {
    try {
      await heartbeat.mutateAsync(gateway.id);
      toast({ tone: "ok", title: "Health check successful, gateway is healthy" });
    } catch {
      toast({ tone: "bad", title: "Health check failed, gateway is unreachable" });
    }
  };

  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[{ label: "Gateways", link: go.link(backHref(orgId)) }]}
        title={gateway.name}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" iconRight="more">
                Options
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={async () => {
                  if (await copyText(gateway.id))
                    toast({ tone: "neutral", title: "Gateway ID copied to clipboard" });
                }}
              >
                <Icon name="copy" />
                Copy gateway ID
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canEdit}
                description={canEdit ? undefined : RESTRICTED}
                onSelect={() => setDialog("rename")}
              >
                <Icon name="pencil" />
                Rename gateway
              </DropdownMenuItem>
              {isGatewayRegistered(gateway) && (
                <DropdownMenuItem disabled={heartbeat.isPending} onSelect={onHeartbeat}>
                  <Icon icon={HeartPulseIcon} />
                  Trigger health check
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {gateway.canRevoke && (
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
                Delete gateway
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <DetailLayout
        asideLabel="Details"
        aside={
          <Card variant="framed" title="Details">
            <DataList
              variant="props"
              density="compact"
              items={[
                ["Name", gateway.name],
                [
                  "ID",
                  <TruncatedValue
                    key="id"
                    value={gateway.id}
                    copyLabel="Copy gateway ID to clipboard"
                  />
                ],
                ["Health", <GatewayHealth key="health" gateway={gateway} size="md" />],
                ["Connection", <Connection key="connection" gateway={gateway} />],
                ["CLI version", <CliVersion key="cli-version" gateway={gateway} />],
                [
                  "Last seen",
                  lastSeen ? (
                    <Tooltip key="seen" content={new Date(lastSeen).toUTCString()}>
                      <span>{dateTime(lastSeen)}</span>
                    </Tooltip>
                  ) : (
                    <Dash key="seen" />
                  )
                ],
                ["Created", dateTime(gateway.createdAt)]
              ]}
            />
          </Card>
        }
      >
        <Stack gap={24}>
          <GatewayDeployCard gateway={gateway} />
          <ConnectedResourcesCard gatewayId={gateway.id} />
          <AuthenticationCard gateway={gateway} canEdit={canEdit} />
        </Stack>
      </DetailLayout>
      <NameDialog
        open={dialog === "rename"}
        onOpenChange={(open) => setDialog(open ? "rename" : undefined)}
        title="Rename gateway"
        initialName={gateway.name}
        submitLabel="Rename"
        onSubmit={async (name) => {
          await updateGateway.mutateAsync({ gatewayId: gateway.id, name });
          saved("Gateway renamed");
        }}
      />
      <ConfirmDialog
        open={dialog === "revoke"}
        onOpenChange={(open) => setDialog(open ? "revoke" : undefined)}
        title="Revoke gateway access?"
        description="The gateway will be disconnected and active tokens invalidated. It must re-authenticate to reconnect."
        confirmText={gateway.name}
        action="Revoke access"
        onConfirm={async () => {
          await revokeGateway.mutateAsync({ gatewayId: gateway.id });
          saved("Gateway access revoked");
        }}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : undefined)}
        title="Delete gateway?"
        description="This permanently removes the gateway from your organization. Deleting it cannot be undone."
        confirmText={gateway.name}
        action="Delete gateway"
        onConfirm={async () => {
          await deleteGateway.mutateAsync(gateway.id);
          saved("Successfully deleted gateway");
          go(backHref(orgId));
        }}
      />
    </Stack>
  );
};
