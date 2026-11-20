import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClipboardListIcon,
  TriangleAlertIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue,
  IconButton,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useTimedReset } from "@app/hooks";
import { useUpdateGateway } from "@app/hooks/api/gateways-v2";
import { TGatewayV2, TGatewayV2WithAuthMethod } from "@app/hooks/api/gateways-v2/types";
import {
  formatGatewayCliVersion,
  getGatewayTransportHealth,
  getLastSeenHeartbeat,
  isGatewayHealthy
} from "@app/hooks/api/gateways-v2/utils";

import {
  NetworkingAuthMethodForm,
  toNetworkingAuthMethodInput
} from "../../../components/NetworkingAuthMethodForm";

const isGatewayUnregistered = (gateway: TGatewayV2) =>
  !getLastSeenHeartbeat(gateway) &&
  gateway.heartbeatTTL === null &&
  gateway.directAddress === null &&
  gateway.relayId === null;

const HealthBadge = ({ gateway }: { gateway: TGatewayV2 }) => {
  if (isGatewayUnregistered(gateway)) {
    return <Badge variant="warning">Unregistered</Badge>;
  }
  if (isGatewayHealthy(gateway)) {
    return <Badge variant="success">Healthy</Badge>;
  }
  return <Badge variant="danger">Unreachable</Badge>;
};

const GatewayCliVersion = ({ gateway }: { gateway: TGatewayV2 }) => {
  if (gateway.cliVersionReportedAt) {
    if (gateway.cliVersion) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default font-mono text-xs">
              {formatGatewayCliVersion(gateway.cliVersion)}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {`Reported by the gateway on ${format(new Date(gateway.cliVersionReportedAt), "PPpp")}.`}
          </TooltipContent>
        </Tooltip>
      );
    }

    // A report with no version comes only from a CLI release too old to send one.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-muted">Older than v0.43.131</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          This gateway runs an Infisical CLI release that doesn&apos;t report its version. Upgrade
          it to v0.43.131 or later to see the exact version here.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isGatewayUnregistered(gateway)) return <span className="text-muted">—</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default text-muted">—</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        The gateway hasn&apos;t reported its Infisical CLI version yet.
      </TooltipContent>
    </Tooltip>
  );
};

export const GatewayDetailsCard = ({ gateway }: { gateway: TGatewayV2WithAuthMethod }) => {
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { mutateAsync: updateGateway, isPending: isUpdatingAuthMethod } = useUpdateGateway();

  const { authMethod } = gateway;
  const isIdentityGateway = authMethod.method === "identity";
  const effectiveHeartbeat = getLastSeenHeartbeat(gateway);
  const transportHealth = getGatewayTransportHealth(gateway);

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <DetailGroupHeader>General</DetailGroupHeader>
          <Detail>
            <DetailLabel>ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              <span className="font-mono text-xs">{gateway.id}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    aria-label="copy gateway id"
                    onClick={() => {
                      navigator.clipboard.writeText(gateway.id);
                      setCopyTextId("Copied");
                    }}
                    variant="ghost"
                    size="xs"
                  >
                    {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>Copy gateway ID to clipboard</TooltipContent>
              </Tooltip>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Health</DetailLabel>
            <DetailValue>
              <HealthBadge gateway={gateway} />
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Connection</DetailLabel>
            <DetailValue className="flex flex-col items-start gap-1">
              {transportHealth.length ? (
                transportHealth.map((transport) => (
                  <span key={transport.transport} className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant={transport.isHealthy ? "success" : "danger"}
                          iconPosition="left"
                          className="cursor-default"
                        >
                          {transport.isHealthy ? (
                            <CircleCheckIcon className="size-3" />
                          ) : (
                            <CircleXIcon className="size-3" />
                          )}
                          {transport.label}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {transport.probedAt
                          ? `Last seen ${format(new Date(transport.probedAt), "PPpp")}`
                          : "Never reached"}
                      </TooltipContent>
                    </Tooltip>
                    {transport.transport === "direct" && gateway.directAddress ? (
                      <span className="text-xs text-muted">{gateway.directAddress}</span>
                    ) : null}
                  </span>
                ))
              ) : (
                <span className="text-muted">Not configured</span>
              )}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Last Seen</DetailLabel>
            <DetailValue>
              {effectiveHeartbeat ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default">
                      {format(new Date(effectiveHeartbeat), "PPpp")}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{new Date(effectiveHeartbeat).toUTCString()}</TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-muted">—</span>
              )}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>CLI Version</DetailLabel>
            <DetailValue>
              <GatewayCliVersion gateway={gateway} />
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Created</DetailLabel>
            <DetailValue>{format(new Date(gateway.createdAt), "PPpp")}</DetailValue>
          </Detail>
        </DetailGroup>
        <Separator className="my-4" />
        <DetailGroup>
          <DetailGroupHeader>Authentication</DetailGroupHeader>
          {isIdentityGateway && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>Authenticated via Machine Identity (Legacy)</AlertTitle>
              <AlertDescription>
                <p>
                  This gateway is still using machine identity. We recommend creating a new gateway.
                </p>
                <Link
                  to="/organizations/$orgId/networking"
                  params={{ orgId }}
                  search={{ selectedTab: "gateways" }}
                  className="underline underline-offset-4"
                >
                  Create a new gateway
                </Link>
              </AlertDescription>
            </Alert>
          )}
          {!isIdentityGateway && (
            <OrgPermissionCan
              I={OrgGatewayPermissionActions.EditGateways}
              a={OrgPermissionSubjects.Gateway}
            >
              {(isAllowed) => (
                <NetworkingAuthMethodForm
                  currentMethod={authMethod}
                  isDisabled={!isAllowed}
                  isPending={isUpdatingAuthMethod}
                  availableMethods={["token", "aws", "gcp", "kubernetes"]}
                  currentGatewayId={gateway.id}
                  onUpdate={async (form) => {
                    try {
                      await updateGateway({
                        gatewayId: gateway.id,
                        authMethod: toNetworkingAuthMethodInput(form)
                      });
                      createNotification({ type: "success", text: "Auth method updated" });
                      return true;
                    } catch {
                      createNotification({
                        type: "error",
                        text: "Failed to update auth method"
                      });
                      return false;
                    }
                  }}
                />
              )}
            </OrgPermissionCan>
          )}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
