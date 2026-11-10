import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import { BanIcon, HeartPulseIcon, PencilIcon } from "lucide-react";

import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { DetailLayout, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { StatusText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { TGatewayV2WithAuthMethod } from "@app/hooks/api/gateways-v2/types";
import { getGatewayTransportHealth, getLastSeenHeartbeat } from "@app/hooks/api/gateways-v2/utils";

import { CopyButton, Dash, Value } from "../../access/org/detail-parts";
import { useOrgId, useOrgPermission } from "../../access/permissions";
import { saved, toast } from "../../access/toast";
import { AccessRestricted, Muted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo } from "../../links";
import {
  NetworkingAuthMethodForm,
  toNetworkingAuthMethodInput
} from "../../networking/auth-method-form";
import { ConfirmDialog } from "../../networking/confirm-dialog";
import { GatewayHealth, isGatewayRegistered } from "../../networking/health";
import { NameDialog } from "../../networking/name-dialog";
import { GatewayDeployCard } from "./deploy";
import { ConnectedResourcesCard } from "./resources";

const backHref = (orgId: string) => orgHref(orgId, "/networking?selectedTab=gateways");

const BackLink = ({ orgId }: { orgId: string }) => (
  <Stack align="start">
    <Button variant="ghost" size="sm" icon="chev-left" asChild>
      <a href={backHref(orgId)}>Gateways</a>
    </Button>
  </Stack>
);

const dateTime = (value: string) => format(new Date(value), "PPpp");

const Connection = ({ gateway }: { gateway: TGatewayV2WithAuthMethod }) => {
  const transports = getGatewayTransportHealth(gateway);
  if (!transports.length) return <Muted>Not configured</Muted>;
  return (
    <Stack gap={4}>
      {transports.map((transport) => (
        <Value key={transport.transport}>
          <Tooltip
            content={
              transport.probedAt ? `Last seen ${dateTime(transport.probedAt)}` : "Never reached"
            }
          >
            <StatusText
              tone={transport.isHealthy ? "ok" : "bad"}
              icon={transport.isHealthy ? "check-c" : "x"}
              tabIndex={0}
            >
              {transport.label}
            </StatusText>
          </Tooltip>
          {transport.transport === "direct" && gateway.directAddress && (
            <Value mono>{gateway.directAddress}</Value>
          )}
        </Value>
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
    from: "/v4/organizations/$orgId/networking/gateways/$gatewayId"
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
        icon="globe"
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
      <Stack gap={8}>
        <BackLink orgId={orgId} />
        <PageHeader
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
                  onSelect={() => {
                    navigator.clipboard?.writeText(gateway.id);
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
                  <Icon icon={PencilIcon} />
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
      </Stack>
      <DetailLayout
        asideLabel="Details"
        aside={
          <Stack gap={24}>
            <Card variant="framed" title="Details">
              <DataList
                variant="props"
                density="compact"
                items={[
                  [
                    "ID",
                    <Value key="id" mono>
                      {gateway.id}
                      <CopyButton value={gateway.id} label="Copy gateway ID to clipboard" />
                    </Value>
                  ],
                  ["Health", <GatewayHealth key="health" gateway={gateway} />],
                  ["Connection", <Connection key="connection" gateway={gateway} />],
                  [
                    "Last seen",
                    lastSeen ? (
                      <Tooltip key="seen" content={new Date(lastSeen).toUTCString()}>
                        <span>{dateTime(lastSeen)}</span>
                      </Tooltip>
                    ) : (
                      <Dash key="seen" />
                    ),
                    { span: "half" }
                  ],
                  ["Created", dateTime(gateway.createdAt), { span: "half" }]
                ]}
              />
            </Card>
            <AuthenticationCard gateway={gateway} canEdit={canEdit} />
          </Stack>
        }
      >
        <Stack gap={24}>
          <GatewayDeployCard gateway={gateway} />
          <ConnectedResourcesCard gatewayId={gateway.id} />
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
