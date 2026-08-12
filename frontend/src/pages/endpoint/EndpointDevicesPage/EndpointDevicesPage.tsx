import { Helmet } from "react-helmet";
import { formatDistanceToNow } from "date-fns";
import { MonitorIcon, MoreHorizontal, Plus, Trash2 } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
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
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  EndpointDeviceStatus,
  TEndpointDevice,
  useListEndpointDevices
} from "@app/hooks/api/endpoint";
import { ProjectType } from "@app/hooks/api/projects/types";

import { DeleteDeviceModal } from "./components/DeleteDeviceModal";
import { RegisterDeviceModal } from "./components/RegisterDeviceModal";

const DeviceStatusBadge = ({ device }: { device: TEndpointDevice }) => {
  if (device.status === EndpointDeviceStatus.Inactive) {
    return <Badge variant="neutral">Inactive</Badge>;
  }

  return device.isOnline ? (
    <Badge variant="success">Online</Badge>
  ) : (
    <Badge variant="warning">Offline</Badge>
  );
};

const BlockedAddressesCell = ({ device }: { device: TEndpointDevice }) => {
  if (device.blockedAddresses.length === 0) {
    return <span className="text-xs text-muted">None reported</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="danger" className="cursor-default">
          {device.blockedAddresses.length} blocked
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="mb-1 font-medium">Enforced by this device</p>
        <ul className="flex flex-col gap-0.5 font-mono">
          {device.blockedAddresses.map((address) => (
            <li key={address}>{address}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
};

export const EndpointDevicesPage = () => {
  const { data: devices, isPending } = useListEndpointDevices();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "registerDevice",
    "deleteDevice"
  ] as const);

  return (
    <>
      <Helmet>
        <title>Endpoint Devices</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.Endpoint}
          title="Devices"
          description="The fleet of devices running the Endpoint agent for this organization."
        />

        <Card>
          <CardHeader>
            <CardTitle>Registered Devices</CardTitle>
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Create}
                a={ProjectPermissionSub.Endpoint}
              >
                {(isAllowed) => (
                  <Button
                    variant="endpoint"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("registerDevice")}
                  >
                    <Plus />
                    Register Device
                  </Button>
                )}
              </ProjectPermissionCan>
            </CardAction>
          </CardHeader>

          {isPending && (
            <CardContent>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </CardContent>
          )}

          {!isPending && devices?.length === 0 && (
            <CardContent>
              <Empty className="border">
                <EmptyMedia variant="icon">
                  <MonitorIcon />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No devices yet</EmptyTitle>
                  <EmptyDescription>
                    Register a device to the person who uses it. It comes online once they run{" "}
                    <span className="font-mono">sudo infisical endpoint start</span> on it and sign
                    in.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          )}

          {!isPending && devices && devices.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Agent Version</TableHead>
                  <TableHead>Config Version</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Enforcing</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium text-foreground">{device.name}</TableCell>
                    <TableCell>
                      <div className="text-foreground">{device.owner.name}</div>
                      {device.owner.name !== device.owner.email && (
                        <div className="text-xs text-muted">{device.owner.email}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <DeviceStatusBadge device={device} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted">
                      {device.agentVersion ?? "Unknown"}
                    </TableCell>
                    <TableCell className="text-muted">{device.configVersion}</TableCell>
                    <TableCell className="text-muted">
                      {device.lastSeenAt
                        ? formatDistanceToNow(new Date(device.lastSeenAt), { addSuffix: true })
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <BlockedAddressesCell device={device} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label={`Actions for ${device.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.Endpoint}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                variant="danger"
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("deleteDevice", device)}
                              >
                                <Trash2 />
                                Remove
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
          )}
        </Card>
      </div>

      <RegisterDeviceModal
        isOpen={popUp.registerDevice.isOpen}
        onOpenChange={(open) => handlePopUpToggle("registerDevice", open)}
      />

      <DeleteDeviceModal
        device={popUp.deleteDevice.data as TEndpointDevice | undefined}
        isOpen={popUp.deleteDevice.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteDevice");
        }}
      />
    </>
  );
};
