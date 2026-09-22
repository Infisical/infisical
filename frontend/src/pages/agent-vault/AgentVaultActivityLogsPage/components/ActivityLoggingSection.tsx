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

// AWS is the only app type Agent Vault allows, so the mark is fixed rather than looked up per row.
const AWS_CONNECTION = APP_CONNECTION_MAP[AppConnection.AWS];

export const ActivityLoggingSection = () => {
  const { currentProject } = useProject();
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Held as a snapshot rather than read from the query: after a save the query is only invalidated,
  // so it still holds the pre-save destination the policies would be generated from.
  const [awsSetup, setAwsSetup] = useState<{
    bucket: string | null;
    keyPrefix: string | null;
    isCorsMissing?: boolean;
  } | null>(null);
  const { data, isPending } = useGetAgentVaultActivityConfig();
  const { data: connections } = useListAvailableAppConnections(
    AppConnection.AWS,
    currentProject.id
  );

  const config = data?.config;
  const hasDestination = Boolean(config?.bucket);
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
              <Button
                variant="outline"
                isDisabled={isPending}
                onClick={() =>
                  setAwsSetup({
                    bucket: config?.bucket ?? null,
                    keyPrefix: config?.keyPrefix ?? null
                  })
                }
              >
                View AWS Setup
              </Button>
              <Button variant="av" isDisabled={isPending} onClick={() => setIsModalOpen(true)}>
                {/* Configure while loading too, so a configured org never flashes "Set Up Logging". */}
                {!data || hasDestination ? "Configure" : "Set Up Logging"}
              </Button>
            </div>
          </CardAction>
        </CardHeader>

        {/* No body until there is something to put in it. An unconfigured card is its header and
            its actions, which is what this card was before it had any detail to show. */}
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
              // Two columns, so each line is a pair that belongs together: how it's doing, then the
              // credential and where it reaches, then the location of the objects themselves.
              <DetailGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail>
                  <DetailLabel>Status</DetailLabel>
                  <DetailValue>
                    {/* The switch itself, so the word matches the toggle in the dialog. Whether
                        records are actually landing is the warning above, which covers the cases
                        this cannot: enabled with no connection, or a full store. */}
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
                    {/* No mark when there is no connection to mark: an AWS logo beside "None" reads
                      as though one is attached. */}
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
        // Only when the save left recording on. Someone who just switched it off has no bucket to
        // go and configure, so opening this at them is answering a question they didn't ask.
        onSaved={(result, isCorsMissing) => {
          if (!isAgentVaultRecording(result.config)) return;
          setAwsSetup({
            bucket: result.config.bucket,
            keyPrefix: result.config.keyPrefix,
            isCorsMissing
          });
        }}
      />

      <AwsSetupDialog
        isOpen={Boolean(awsSetup)}
        onOpenChange={(isOpen) => !isOpen && setAwsSetup(null)}
        bucket={awsSetup?.bucket ?? null}
        keyPrefix={awsSetup?.keyPrefix ?? null}
        isCorsMissing={awsSetup?.isCorsMissing}
      />
    </>
  );
};
