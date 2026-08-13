import { Helmet } from "react-helmet";
import { Link, useParams } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { LaptopIcon, MonitorIcon, MoreHorizontal, Plus, Trash2 } from "lucide-react";

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
  TableRow
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

// The registered name is whatever an admin typed; the hostname and the hardware are what the machine
// says it is. Leading with both is what makes a row read as someone's laptop rather than a record.
const MachineCell = ({ device }: { device: TEndpointDevice }) => {
  const os = [device.osName, device.osVersion].filter(Boolean).join(" ");

  if (!os && !device.cpuModel) {
    return <span className="text-sm text-muted">Not reported yet</span>;
  }

  return (
    <div>
      <div className="text-sm text-foreground">{os || "Unknown OS"}</div>
      {device.cpuModel && <div className="text-xs text-muted">{device.cpuModel}</div>}
    </div>
  );
};

export const EndpointDevicesPage = () => {
  const { orgId } = useParams({ strict: false }) as { orgId: string };
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
          description="The laptops and desktops your people work on, each running the Endpoint agent."
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
                  <TableHead>Machine</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <LaptopIcon className="size-4 shrink-0 text-muted" />
                        <div className="min-w-0">
                          <Link
                            to="/organizations/$orgId/endpoint/devices/$deviceId"
                            params={{ orgId, deviceId: device.id }}
                            className="text-foreground hover:text-primary hover:underline"
                          >
                            {device.name}
                          </Link>
                          {device.hostname && (
                            <div className="truncate font-mono text-xs font-normal text-muted">
                              {device.hostname}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-foreground">{device.owner.name}</div>
                      {device.owner.name !== device.owner.email && (
                        <div className="text-xs text-muted">{device.owner.email}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <MachineCell device={device} />
                    </TableCell>
                    <TableCell>
                      <DeviceStatusBadge device={device} />
                    </TableCell>
                    <TableCell className="text-muted">
                      {device.lastSeenAt
                        ? formatDistanceToNow(new Date(device.lastSeenAt), { addSuffix: true })
                        : "Never"}
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
