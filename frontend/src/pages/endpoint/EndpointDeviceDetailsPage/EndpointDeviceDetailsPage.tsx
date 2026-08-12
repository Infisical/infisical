import { Helmet } from "react-helmet";
import { Link, useParams } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeftIcon, LaptopIcon } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton
} from "@app/components/v3";
import { useListEndpointDevices } from "@app/hooks/api/endpoint";
import { ProjectType } from "@app/hooks/api/projects/types";

import { EventFeedCard } from "../components/EventFeedCard";
import { SecretFindingsCard } from "../components/SecretFindingsCard";
import { TransferCountersCard } from "../components/TransferCountersCard";

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted">{label}</span>
    <span className="text-sm text-foreground">{children}</span>
  </div>
);

export const EndpointDeviceDetailsPage = () => {
  const { orgId, deviceId } = useParams({ strict: false }) as { orgId: string; deviceId: string };

  // The device list is small and already cached by the Devices page, so this avoids a second
  // endpoint for a single row.
  const { data: devices, isPending } = useListEndpointDevices();
  const device = devices?.find((candidate) => candidate.id === deviceId);

  return (
    <>
      <Helmet>
        <title>{device ? `${device.name} | Endpoint` : "Endpoint Device"}</title>
      </Helmet>
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-6">
        <div>
          <Link
            to="/organizations/$orgId/endpoint/devices"
            params={{ orgId }}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Devices
          </Link>
          <PageHeader
            scope={ProjectType.Endpoint}
            title={device?.name ?? "Device"}
            description="What this device is enforcing, how much it has sent, and what it has reported."
          />
        </div>

        {isPending && <Skeleton className="h-40 w-full rounded-md" />}

        {!isPending && !device && (
          <Card>
            <CardContent>
              <Empty className="border">
                <EmptyMedia variant="icon">
                  <LaptopIcon />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>Device not found</EmptyTitle>
                  <EmptyDescription>
                    It may have been removed. Go back to Devices to see what is registered.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        )}

        {device && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-6 md:grid-cols-4">
                <Detail label="Assigned To">
                  {device.owner.name}
                  <span className="block text-xs text-muted">{device.owner.email}</span>
                </Detail>
                <Detail label="Status">
                  {device.isOnline ? (
                    <Badge variant="success">Online</Badge>
                  ) : (
                    <Badge variant="neutral">Offline</Badge>
                  )}
                </Detail>
                <Detail label="Agent Version">
                  <span className="font-mono text-xs">{device.agentVersion ?? "-"}</span>
                </Detail>
                <Detail label="Last Seen">
                  {device.lastSeenAt
                    ? formatDistanceToNow(new Date(device.lastSeenAt), { addSuffix: true })
                    : "Never"}
                </Detail>
                <Detail label="Config Version">{device.configVersion}</Detail>
                <Detail label="Packet Filter">
                  {device.pfEnabled ? (
                    <Badge variant="success">Enabled</Badge>
                  ) : (
                    <Badge variant="neutral">Not reported</Badge>
                  )}
                </Detail>
                <div className="col-span-2 flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    Enforcing ({device.blockedAddresses.length})
                  </span>
                  {device.blockedAddresses.length === 0 ? (
                    <span className="text-sm text-muted">Nothing blocked</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {device.blockedAddresses.map((address) => (
                        <Badge key={address} variant="danger" className="font-mono">
                          {address}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <SecretFindingsCard deviceId={device.id} />

            <TransferCountersCard deviceId={device.id} />

            <EventFeedCard
              deviceId={device.id}
              title="Activity"
              description="Everything this device has reported, newest first."
            />
          </>
        )}
      </div>
    </>
  );
};
