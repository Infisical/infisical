import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon, TriangleAlertIcon } from "lucide-react";

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
import { isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";

import { NetworkingAuthMethodForm } from "../../../components/NetworkingAuthMethodForm";

const HealthBadge = ({ gateway }: { gateway: TGatewayV2 }) => {
  if (!gateway.heartbeat && !gateway.heartbeatTTL) {
    return <Badge variant="warning">Unregistered</Badge>;
  }
  if (isGatewayHealthy(gateway)) {
    return <Badge variant="success">Healthy</Badge>;
  }
  return <Badge variant="danger">Unreachable</Badge>;
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
            <DetailLabel>Last Seen</DetailLabel>
            <DetailValue>
              {gateway.heartbeat ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default">
                      {format(new Date(gateway.heartbeat), "PPpp")}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{new Date(gateway.heartbeat).toUTCString()}</TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-muted">—</span>
              )}
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
                  onUpdate={async (form) => {
                    try {
                      await updateGateway({
                        gatewayId: gateway.id,
                        authMethod:
                          form.method === "aws"
                            ? {
                                method: "aws",
                                stsEndpoint: form.stsEndpoint,
                                allowedPrincipalArns: form.allowedPrincipalArns,
                                allowedAccountIds: form.allowedAccountIds
                              }
                            : { method: "token" }
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
