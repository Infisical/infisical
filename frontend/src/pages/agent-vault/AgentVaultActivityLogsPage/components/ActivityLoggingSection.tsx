import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  DocumentationLinkBadge,
  ProviderIcon,
  Skeleton
} from "@app/components/v3";
import { useProject } from "@app/context";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { useGetAgentVaultActivityConfig } from "@app/hooks/api/agentVault";
import { isAgentVaultRecording } from "@app/hooks/api/agentVault/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";
import { ActivityLoggingModal } from "./ActivityLoggingModal";
import { AwsSetupDialog } from "./AwsSetupDialog";

const AWS_CONNECTION = APP_CONNECTION_MAP[AppConnection.AWS];

export const ActivityLoggingSection = () => {
  const { currentProject } = useProject();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [awsSetup, setAwsSetup] = useState<{
    bucket: string | null;
    keyPrefix: string | null;
    corsProbeUrl: string | null;
  } | null>(null);
  const { data, isPending, refetch } = useGetAgentVaultActivityConfig();
  const { data: connections } = useListAvailableAppConnections(
    AppConnection.AWS,
    currentProject.id
  );

  const config = data?.config;
  const hasDestination = Boolean(config?.bucket);
  // The probe link is presigned for minutes, so a fresh one is fetched each time the dialog opens.
  const openAwsSetup = () => {
    setAwsSetup({
      bucket: config?.bucket ?? null,
      keyPrefix: config?.keyPrefix ?? null,
      corsProbeUrl: null
    });
    refetch()
      .then(({ data: fresh }) => {
        const corsProbeUrl = fresh?.corsProbeUrl ?? null;
        setAwsSetup((prev) => prev && { ...prev, corsProbeUrl });
      })
      .catch(() => {});
  };

  const connectionName =
    connections?.find((connection) => connection.id === config?.appConnectionId)?.name ?? null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Activity Logging
            <DocumentationLinkBadge href={AgentVaultDocsUrls.activityLogs} />
          </CardTitle>
          <CardDescription>
            Requests your agents make through a proxy, encrypted and written to a bucket you own.
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-2">
              <Button variant="outline" isDisabled={isPending} onClick={openAwsSetup}>
                View AWS Setup
              </Button>
              <Button variant="av" isDisabled={isPending} onClick={() => setIsModalOpen(true)}>
                {!data || hasDestination ? "Configure" : "Set Up Logging"}
              </Button>
            </div>
          </CardAction>
        </CardHeader>

        {(isPending || (hasDestination && config)) && (
          <CardContent>
            {isPending && (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <Skeleton key={`activity-config-skeleton-${index}`} className="h-8 w-full" />
                ))}
              </div>
            )}

            {!isPending && hasDestination && config && (
              <DetailGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail>
                  <DetailLabel>Status</DetailLabel>
                  <DetailValue>
                    <Badge variant={config.enabled ? "success" : "neutral"}>
                      {config.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Last Recorded</DetailLabel>
                  <DetailValue>
                    {data?.lastRecordedAt
                      ? formatDistanceToNow(new Date(data.lastRecordedAt), { addSuffix: true })
                      : "Never"}
                  </DetailValue>
                </Detail>

                <Detail>
                  <DetailLabel>Connection</DetailLabel>
                  <DetailValue className="flex items-center gap-2">
                    {connectionName && (
                      <ProviderIcon
                        alt={`${AWS_CONNECTION.name} connection`}
                        icon={AWS_CONNECTION.image}
                        className="w-4 shrink-0"
                      />
                    )}
                    {connectionName ?? "None"}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Region</DetailLabel>
                  <DetailValue>{config.region}</DetailValue>
                </Detail>

                <Detail>
                  <DetailLabel>Bucket</DetailLabel>
                  <DetailValue>{config.bucket}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Key Prefix</DetailLabel>
                  <DetailValue>{config.keyPrefix || "None"}</DetailValue>
                </Detail>
              </DetailGroup>
            )}
          </CardContent>
        )}
      </Card>

      <ActivityLoggingModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSaved={(result) => {
          if (!isAgentVaultRecording(result.config)) return;
          setAwsSetup({
            bucket: result.config.bucket,
            keyPrefix: result.config.keyPrefix,
            corsProbeUrl: result.corsProbeUrl
          });
        }}
      />

      <AwsSetupDialog
        isOpen={Boolean(awsSetup)}
        onOpenChange={(isOpen) => !isOpen && setAwsSetup(null)}
        bucket={awsSetup?.bucket ?? null}
        keyPrefix={awsSetup?.keyPrefix ?? null}
        corsProbeUrl={awsSetup?.corsProbeUrl ?? null}
      />
    </>
  );
};
