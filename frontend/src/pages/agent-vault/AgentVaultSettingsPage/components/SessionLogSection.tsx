import { useState } from "react";
import { subject } from "@casl/ability";
import { useQueryClient } from "@tanstack/react-query";
import { AsteriskIcon, ChevronDownIcon, PlugIcon } from "lucide-react";

import {
  Badge,
  Button,
  ButtonGroup,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  ProviderIcon,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  agentVaultKeys,
  fetchAgentVaultSessionLogReadAccess,
  useGetAgentVaultSessionLogSettings
} from "@app/hooks/api/agentVault";
import {
  isAgentVaultRecording,
  TAgentVaultSessionLogSettings
} from "@app/hooks/api/agentVault/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  useListAppConnections,
  useListAvailableAppConnections
} from "@app/hooks/api/appConnections/queries";
import { EditAppConnectionCredentialsModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/EditAppConnectionCredentialsModal";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";
import { AwsSetupDialog } from "./AwsSetupDialog";
import { SessionLogConnectionsSheet } from "./SessionLogConnectionsSheet";
import { SessionLogModal } from "./SessionLogModal";

const AWS_CONNECTION = APP_CONNECTION_MAP[AppConnection.AWS];

export const SessionLogSection = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConnectionsSheetOpen, setIsConnectionsSheetOpen] = useState(false);
  const [isEditCredentialsOpen, setIsEditCredentialsOpen] = useState(false);
  const [awsSetup, setAwsSetup] = useState<{
    bucket: string | null;
    keyPrefix: string | null;
  } | null>(null);
  const { data: config, isPending } = useGetAgentVaultSessionLogSettings();
  const { data: connections } = useListAvailableAppConnections(
    AppConnection.AWS,
    currentProject.id
  );
  const { data: agentVaultConnections = [] } = useListAppConnections(currentProject.id);

  const hasDestination = Boolean(config?.bucket);

  // Saving with session logs on already proved Infisical can write, so the dialog only opens for a
  // step the read check finds missing.
  const offerAwsSetup = async (settings: TAgentVaultSessionLogSettings) => {
    if (!isAgentVaultRecording(settings)) return;
    const readAccess = await queryClient
      .fetchQuery({
        queryKey: agentVaultKeys.sessionLogCorsProbe(currentOrg.id),
        queryFn: fetchAgentVaultSessionLogReadAccess
      })
      .catch(() => null);
    if (readAccess === "cors-missing" || readAccess === "access-denied") {
      setAwsSetup({ bucket: settings.bucket, keyPrefix: settings.keyPrefix });
    }
  };

  const connection = connections?.find(({ id }) => id === config?.appConnectionId);
  const connectionName = connection?.name ?? null;
  const isOrgConnection = Boolean(connection && !connection.projectId);
  // The available list holds only names and IDs, and the credentials editor needs the full
  // connection, which only Agent Vault's own list returns.
  const editableConnection = agentVaultConnections.find(({ id }) => id === config?.appConnectionId);
  const canEditConnection = editableConnection
    ? permission.can(
        ProjectPermissionAppConnectionActions.Edit,
        subject(ProjectPermissionSub.AppConnections, { connectionId: editableConnection.id })
      )
    : false;
  const hasConnectionMenu = Boolean(config?.appConnectionId) || agentVaultConnections.length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Session Logs
            <DocumentationLinkBadge href={AgentVaultDocsUrls.sessionLogs} />
          </CardTitle>
          <CardDescription>
            Requests your agents make through a proxy, encrypted and written to a bucket you own.
          </CardDescription>
          <CardAction>
            <ButtonGroup>
              <Button variant="av" isDisabled={isPending} onClick={() => setIsModalOpen(true)}>
                {!config || hasDestination ? "Configure" : "Set Up Session Logs"}
              </Button>
              {hasConnectionMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      variant="av"
                      aria-label="Connection options"
                      className="border-l-transparent"
                    >
                      <ChevronDownIcon />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={4} className="min-w-48">
                    {config?.appConnectionId && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <DropdownMenuItem
                              isDisabled={!canEditConnection}
                              onClick={() => setIsEditCredentialsOpen(true)}
                            >
                              <AsteriskIcon />
                              Edit AWS Credentials
                            </DropdownMenuItem>
                          </div>
                        </TooltipTrigger>
                        {isOrgConnection && (
                          <TooltipContent side="left">
                            Session logs use an organization connection. Edit its credentials under
                            Integrations.
                          </TooltipContent>
                        )}
                      </Tooltip>
                    )}
                    <DropdownMenuItem onClick={() => setIsConnectionsSheetOpen(true)}>
                      <PlugIcon />
                      Manage Connections
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </ButtonGroup>
          </CardAction>
        </CardHeader>

        {(isPending || (hasDestination && config)) && (
          <CardContent>
            {isPending && <Skeleton className="h-10 w-full" />}

            {!isPending && hasDestination && config && (
              <DetailGroup className="flex-row flex-wrap gap-x-8">
                <Detail>
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

      <SessionLogModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSaved={offerAwsSetup}
        onEditCredentials={canEditConnection ? () => setIsEditCredentialsOpen(true) : undefined}
      />

      <AwsSetupDialog
        isOpen={Boolean(awsSetup)}
        onOpenChange={(isOpen) => !isOpen && setAwsSetup(null)}
        bucket={awsSetup?.bucket ?? null}
        keyPrefix={awsSetup?.keyPrefix ?? null}
      />

      <EditAppConnectionCredentialsModal
        isOpen={isEditCredentialsOpen}
        onOpenChange={setIsEditCredentialsOpen}
        appConnection={editableConnection}
      />

      <SessionLogConnectionsSheet
        isOpen={isConnectionsSheetOpen}
        onOpenChange={setIsConnectionsSheetOpen}
      />
    </>
  );
};
