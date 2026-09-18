import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon
} from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useTimedReset } from "@app/hooks";
import { useListGatewayPools } from "@app/hooks/api/gateway-pools";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { THsmConnector } from "@app/hooks/api/hsmConnectors";

type Props = {
  connector: THsmConnector;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isTesting: boolean;
};

export const HsmConnectorOverviewSection = ({
  connector,
  onTest,
  onEdit,
  onDelete,
  isTesting
}: Props) => {
  const [, isCopying, setCopyText] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const [, isMenuIdCopied, setMenuCopyState] = useTimedReset<string>({ initialState: "Copy" });

  const { data: gateways = [] } = useQuery(gatewaysQueryKeys.list());
  const { data: pools = [] } = useListGatewayPools();

  const reachedFromLabel = (() => {
    if (connector.gatewayId) {
      const g = gateways.find((x) => x.id === connector.gatewayId);
      return g?.name ?? "(deleted)";
    }
    if (connector.gatewayPoolId) {
      const p = pools.find((x) => x.id === connector.gatewayPoolId);
      return p?.name ?? "(deleted)";
    }
    return "-";
  })();

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs" aria-label="Connector options">
                <MoreHorizontalIcon className="size-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard.writeText(connector.id);
                  setMenuCopyState("Copied");
                }}
              >
                {isMenuIdCopied ? <CheckIcon /> : <CopyIcon />}
                Copy Connector ID
              </DropdownMenuItem>
              <ProjectPermissionCan
                I={ProjectPermissionHsmConnectorActions.Test}
                a={ProjectPermissionSub.HsmConnectors}
              >
                {(canTest) => (
                  <DropdownMenuItem isDisabled={!canTest || isTesting} onClick={onTest}>
                    <CheckCircle2Icon />
                    {isTesting ? "Verifying..." : "Verify"}
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionHsmConnectorActions.Edit}
                a={ProjectPermissionSub.HsmConnectors}
              >
                {(canEdit) => (
                  <DropdownMenuItem isDisabled={!canEdit} onClick={onEdit}>
                    <PencilIcon />
                    Edit Details
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionHsmConnectorActions.Delete}
                a={ProjectPermissionSub.HsmConnectors}
              >
                {(canDelete) => (
                  <DropdownMenuItem variant="danger" isDisabled={!canDelete} onClick={onDelete}>
                    <Trash2Icon />
                    Delete Connector
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{connector.name}</DetailValue>
          </Detail>

          <Detail>
            <DetailLabel>Connector ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              <span className="break-all">{connector.id}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    aria-label="Copy connector ID"
                    onClick={() => {
                      navigator.clipboard.writeText(connector.id);
                      setCopyText("Copied");
                    }}
                  >
                    {isCopying ? <CheckIcon /> : <CopyIcon />}
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>{isCopying ? "Copied" : "Copy ID to clipboard"}</TooltipContent>
              </Tooltip>
            </DetailValue>
          </Detail>

          {connector.description && (
            <Detail>
              <DetailLabel>Description</DetailLabel>
              <DetailValue>{connector.description}</DetailValue>
            </Detail>
          )}

          <Detail>
            <DetailLabel>Reached from</DetailLabel>
            <DetailValue>{reachedFromLabel}</DetailValue>
          </Detail>

          <Detail>
            <DetailLabel>Slot label</DetailLabel>
            <DetailValue>{connector.slotLabel}</DetailValue>
          </Detail>

          <Detail>
            <DetailLabel>Key label prefix</DetailLabel>
            <DetailValue>{connector.keyNamePrefix || "-"}</DetailValue>
          </Detail>

          {connector.createdAt && (
            <Detail>
              <DetailLabel>Created</DetailLabel>
              <DetailValue>
                {format(new Date(connector.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </DetailValue>
            </Detail>
          )}

          {connector.updatedAt && (
            <Detail>
              <DetailLabel>Last updated</DetailLabel>
              <DetailValue>
                {format(new Date(connector.updatedAt), "MMM d, yyyy 'at' h:mm a")}
              </DetailValue>
            </Detail>
          )}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
