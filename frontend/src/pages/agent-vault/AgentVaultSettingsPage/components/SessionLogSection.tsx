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
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { isAgentVaultSessionLogStorageOnPlan } from "@app/helpers/agentVaultSessionLogs";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  agentVaultKeys,
  fetchAgentVaultSessionLogReadAccess,
  useGetAgentVaultSessionLogSettings
} from "@app/hooks/api/agentVault";
import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultSessionLogSettings } from "@app/hooks/api/agentVault/types";
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
  const { subscription } = useSubscription();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConnectionsSheetOpen, setIsConnectionsSheetOpen] = useState(false);
  const [isEditCredentialsOpen, setIsEditCredentialsOpen] = useState(false);
  const [awsSetup, setAwsSetup] = useState<{
    bucket: string | null;
    keyPrefix: string | null;
  } | null>(null);
  const { data: state, isPending } = useGetAgentVaultSessionLogSettings();
  const { data: connections } = useListAvailableAppConnections(
    AppConnection.AWS,
    currentProject.id
  );
  const { data: agentVaultConnections = [] } = useListAppConnections(currentProject.id);

  const settings = state?.settings ?? null;
  const external =
    settings?.storage.type === AgentVaultSessionLogStorageType.External ? settings.storage : null;
  // Not on the plan means nothing is recorded, so the card says Disabled even while the setting is on.
  const isEnabled = Boolean(
    settings?.enabled && isAgentVaultSessionLogStorageOnPlan(settings.storage.type, subscription)
  );

  // Saving with session logs on already proved Infisical can write, so the dialog only opens for a
  // step the read check finds missing.
  const offerAwsSetup = async (saved: TAgentVaultSessionLogSettings | null) => {
    if (!saved?.enabled || saved.storage.type !== AgentVaultSessionLogStorageType.External) return;
    const { bucket, keyPrefix } = saved.storage;
    const readCheck = await queryClient
      .fetchQuery({
        queryKey: agentVaultKeys.sessionLogCorsProbe(currentOrg.id),
        queryFn: fetchAgentVaultSessionLogReadAccess
      })
      .catch(() => null);
    if (readCheck?.status === "cors-missing" || readCheck?.status === "access-denied") {
      setAwsSetup({ bucket, keyPrefix });
    }
  };

  const connection = connections?.find(({ id }) => id === external?.appConnectionId);
  const connectionName = connection?.name ?? null;
  const isOrgConnection = Boolean(connection && !connection.projectId);
  // The available list holds only names and IDs, and the credentials editor needs the full
  // connection, which only Agent Vault's own list returns.
  const editableConnection = agentVaultConnections.find(
    ({ id }) => id === external?.appConnectionId
  );
  const canEditConnection = editableConnection
    ? permission.can(
        ProjectPermissionAppConnectionActions.Edit,
        subject(ProjectPermissionSub.AppConnections, { connectionId: editableConnection.id })
      )
    : false;
  const hasConnectionMenu = Boolean(external?.appConnectionId) || agentVaultConnections.length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Session Logs
            <DocumentationLinkBadge href={AgentVaultDocsUrls.sessionLogs} />
          </CardTitle>
          <CardDescription>
            Requests your agents make through a proxy, encrypted and kept in default storage or in a
            bucket you own.
          </CardDescription>
          <CardAction>
            <ButtonGroup>
              <Button variant="av" isDisabled={isPending} onClick={() => setIsModalOpen(true)}>
                {settings ? "Configure" : "Set Up Session Logs"}
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
                    {external?.appConnectionId && (
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

        {(isPending || settings) && (
          <CardContent>
            {isPending && <Skeleton className="h-10 w-full" />}

            {!isPending && settings && (
              <DetailGroup className="flex-row flex-wrap gap-x-8">
                <Detail>
                  <DetailLabel>Status</DetailLabel>
                  <DetailValue>
                    <Badge variant={isEnabled ? "success" : "neutral"}>
                      {isEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </DetailValue>
                </Detail>
                {settings.enabled && (
                  <Detail>
                    <DetailLabel>Storage</DetailLabel>
                    <DetailValue>{external ? "External storage" : "Default storage"}</DetailValue>
                  </Detail>
                )}
                {external && (
                  <>
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
                      <DetailValue>{external.region}</DetailValue>
                    </Detail>
                    <Detail>
                      <DetailLabel>Bucket</DetailLabel>
                      <DetailValue>{external.bucket}</DetailValue>
                    </Detail>
                    <Detail>
                      <DetailLabel>Key Prefix</DetailLabel>
                      <DetailValue>{external.keyPrefix || "None"}</DetailValue>
                    </Detail>
                  </>
                )}
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
