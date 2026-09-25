import { useState } from "react";

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
import { useGetAgentVaultActivityLoggingSettings } from "@app/hooks/api/agentVault";
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
  } | null>(null);
  const { data: config, isPending } = useGetAgentVaultActivityLoggingSettings();
  const { data: connections } = useListAvailableAppConnections(
    AppConnection.AWS,
    currentProject.id
  );

  const hasDestination = Boolean(config?.bucket);
  const openAwsSetup = () =>
    setAwsSetup({ bucket: config?.bucket ?? null, keyPrefix: config?.keyPrefix ?? null });

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
                {!config || hasDestination ? "Configure" : "Set Up Logging"}
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
                <Detail className="sm:col-span-2">
                  <DetailLabel>Status</DetailLabel>
                  <DetailValue>
                    <Badge variant={config.enabled ? "success" : "neutral"}>
                      {config.enabled ? "Enabled" : "Disabled"}
                    </Badge>
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
        onSaved={(settings) => {
          if (!isAgentVaultRecording(settings)) return;
          setAwsSetup({ bucket: settings.bucket, keyPrefix: settings.keyPrefix });
        }}
      />

      <AwsSetupDialog
        isOpen={Boolean(awsSetup)}
        onOpenChange={(isOpen) => !isOpen && setAwsSetup(null)}
        bucket={awsSetup?.bucket ?? null}
        keyPrefix={awsSetup?.keyPrefix ?? null}
      />
    </>
  );
};
