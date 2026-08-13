import { Helmet } from "react-helmet";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeftIcon, LaptopIcon } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { formatBytes } from "@app/helpers/bytes";
import {
  EndpointSecretFindingStatus,
  useListEndpointDevices,
  useListEndpointSecretFindings
} from "@app/hooks/api/endpoint";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CommandConsoleCard } from "../components/CommandConsoleCard";
import { EventFeedCard } from "../components/EventFeedCard";
import { InstalledAppsCard } from "../components/InstalledAppsCard";
import { PrivateAccessCard } from "../components/PrivateAccessCard";
import { SecretFindingsCard } from "../components/SecretFindingsCard";
import { TransferCountersCard } from "../components/TransferCountersCard";
import { TransferHistoryCard } from "../components/TransferHistoryCard";

export enum EndpointDeviceDetailsTab {
  Overview = "overview",
  Applications = "applications",
  Transfer = "transfer",
  PrivateAccess = "private-access",
  Commands = "commands",
  Secrets = "secrets"
}

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted">{label}</span>
    <span className="text-sm text-foreground">{children}</span>
  </div>
);

export const EndpointDeviceDetailsPage = () => {
  const { orgId, deviceId } = useParams({ strict: false }) as { orgId: string; deviceId: string };
  const navigate = useNavigate();

  const selectedTab =
    useSearch({
      strict: false,
      select: (search) => (search as { selectedTab?: string })?.selectedTab
    }) || EndpointDeviceDetailsTab.Overview;

  // The device list is small and already cached by the Devices page, so this avoids a second
  // endpoint for a single row.
  const { data: devices, isPending } = useListEndpointDevices();
  const device = devices?.find((candidate) => candidate.id === deviceId);

  // Same query key the card uses, so React Query serves both from one request. The count belongs on
  // the tab because a finding is the one thing here nobody would think to go looking for.
  const { data: findings } = useListEndpointSecretFindings({ deviceId });
  const openFindingCount = (findings ?? []).filter(
    (finding) => finding.status === EndpointSecretFindingStatus.Open
  ).length;

  const updateTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/endpoint/devices/$deviceId",
      params: { orgId, deviceId },
      search: (prev) => ({ ...prev, selectedTab: tab })
    });
  };

  return (
    <>
      <Helmet>
        <title>{device ? `${device.name} | Endpoint` : "Endpoint Device"}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
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
          <Tabs value={selectedTab} onValueChange={updateTab}>
            <TabsList variant="endpoint">
              <TabsTrigger value={EndpointDeviceDetailsTab.Overview}>Overview</TabsTrigger>
              <TabsTrigger value={EndpointDeviceDetailsTab.Applications}>Applications</TabsTrigger>
              <TabsTrigger value={EndpointDeviceDetailsTab.Transfer}>Network Traffic</TabsTrigger>
              <TabsTrigger value={EndpointDeviceDetailsTab.PrivateAccess}>
                Private Access
              </TabsTrigger>
              <TabsTrigger value={EndpointDeviceDetailsTab.Commands}>Commands</TabsTrigger>
              <TabsTrigger value={EndpointDeviceDetailsTab.Secrets}>
                Findings
                {openFindingCount > 0 && <Badge variant="danger">{openFindingCount}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value={EndpointDeviceDetailsTab.Overview}
              className="flex flex-col gap-6"
            >
              <Card>
                <CardHeader>
                  <CardTitle>Device</CardTitle>
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

              <Card>
                <CardHeader>
                  <CardTitle>System</CardTitle>
                  <CardDescription>
                    Read off the machine by the agent, not typed in at registration.
                    {device.systemInfoReportedAt &&
                      ` Last reported ${formatDistanceToNow(new Date(device.systemInfoReportedAt), {
                        addSuffix: true
                      })}.`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {device.systemInfoReportedAt ? (
                    <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                      <Detail label="Hostname">
                        <span className="font-mono text-xs">{device.hostname ?? "-"}</span>
                      </Detail>
                      <Detail label="Model">{device.modelIdentifier ?? "-"}</Detail>
                      <Detail label="Operating System">
                        {device.osName ?? device.platform ?? "-"} {device.osVersion}
                        {device.osBuild && (
                          <span className="block text-xs text-muted">Build {device.osBuild}</span>
                        )}
                      </Detail>
                      <Detail label="Chip">
                        {device.cpuModel ?? "-"}
                        {typeof device.cpuCores === "number" && (
                          <span className="block text-xs text-muted">{device.cpuCores} cores</span>
                        )}
                      </Detail>
                      <Detail label="Memory">
                        {device.memoryBytes ? formatBytes(device.memoryBytes, 0) : "-"}
                      </Detail>
                      <Detail label="Architecture">
                        <span className="font-mono text-xs">{device.arch ?? "-"}</span>
                      </Detail>
                      <Detail label="Serial Number">
                        <span className="font-mono text-xs">{device.serialNumber ?? "-"}</span>
                      </Detail>
                      <Detail label="IP Address">
                        <span className="font-mono text-xs">{device.ipAddress ?? "-"}</span>
                      </Detail>
                      {device.bootedAt && (
                        <Detail label="Uptime">
                          {formatDistanceToNow(new Date(device.bootedAt))}
                        </Detail>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      This device has not described itself yet. The agent reports what the machine is
                      on its first heartbeat after starting.
                    </p>
                  )}
                </CardContent>
              </Card>

              <EventFeedCard
                deviceId={device.id}
                title="Activity"
                description="Everything this device has reported, newest first."
              />
            </TabsContent>

            <TabsContent value={EndpointDeviceDetailsTab.Applications}>
              <InstalledAppsCard deviceId={device.id} />
            </TabsContent>

            {/* Both cards live here because they are one story told twice: what is leaving the
                device right now, and where it has already gone. */}
            <TabsContent
              value={EndpointDeviceDetailsTab.Transfer}
              className="flex flex-col gap-6"
            >
              <TransferCountersCard deviceId={device.id} />
              <TransferHistoryCard deviceId={device.id} />
            </TabsContent>

            <TabsContent value={EndpointDeviceDetailsTab.PrivateAccess}>
              <PrivateAccessCard deviceId={device.id} />
            </TabsContent>

            <TabsContent value={EndpointDeviceDetailsTab.Commands}>
              <CommandConsoleCard deviceId={device.id} />
            </TabsContent>

            <TabsContent value={EndpointDeviceDetailsTab.Secrets}>
              <SecretFindingsCard deviceId={device.id} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
};
