import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { useOctopusDeployConnectionGetScopeValues } from "@app/hooks/api/appConnections/octopus-deploy";
import {
  OctopusDeploySyncScope,
  TOctopusDeploySync
} from "@app/hooks/api/secretSyncs/types/octopus-deploy-sync";

type Props = {
  secretSync: TOctopusDeploySync;
};

export const OctopusDeploySyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { spaceId, scope, spaceName, scopeValues, projectId, projectName },
    connectionId
  } = secretSync;

  const { data: scopeValuesData, isFetched } = useOctopusDeployConnectionGetScopeValues(
    connectionId,
    spaceId,
    projectId,
    {
      enabled: Boolean(connectionId && spaceId && projectId && scope)
    }
  );

  const {
    environments = [],
    channels = [],
    processes = [],
    roles = [],
    actions = [],
    machines = []
  } = scopeValues ?? {};

  return (
    <>
      <Detail>
        <DetailLabel>Space</DetailLabel>
        <DetailValue>{spaceName || spaceId}</DetailValue>
      </Detail>
      <Detail className="capitalize">
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{scope}</DetailValue>
      </Detail>
      {scope === OctopusDeploySyncScope.Project && (
        <Detail>
          <DetailLabel>Project</DetailLabel>
          <DetailValue>{projectName || projectId}</DetailValue>
        </Detail>
      )}
      {isFetched && (
        <>
          {environments.length > 0 && (
            <Detail>
              <DetailLabel>Environments</DetailLabel>
              <DetailValue>
                {scopeValuesData?.environments
                  .filter((env) => environments.includes(env.id))
                  .map((env) => env.name)
                  .join(", ") ?? environments.join(", ")}
              </DetailValue>
            </Detail>
          )}
          {roles.length > 0 && (
            <Detail>
              <DetailLabel>Target Tags</DetailLabel>
              <DetailValue>
                {scopeValuesData?.roles
                  .filter((role) => roles.includes(role.id))
                  .map((role) => role.name)
                  .join(", ") ?? roles.join(", ")}
              </DetailValue>
            </Detail>
          )}
          {machines.length > 0 && (
            <Detail>
              <DetailLabel>Targets</DetailLabel>
              <DetailValue>
                {scopeValuesData?.machines
                  .filter((machine) => machines.includes(machine.id))
                  .map((machine) => machine.name)
                  .join(", ") ?? machines.join(", ")}
              </DetailValue>
            </Detail>
          )}
          {processes.length > 0 && (
            <Detail>
              <DetailLabel>Processes</DetailLabel>
              <DetailValue>
                {scopeValuesData?.processes
                  .filter((process) => processes.includes(process.id))
                  .map((process) => process.name)
                  .join(", ") ?? processes.join(", ")}
              </DetailValue>
            </Detail>
          )}
          {actions.length > 0 && (
            <Detail>
              <DetailLabel>Deployment Steps</DetailLabel>
              <DetailValue>
                {scopeValuesData?.actions
                  .filter((action) => actions.includes(action.id))
                  .map((action) => action.name)
                  .join(", ") ?? actions.join(", ")}
              </DetailValue>
            </Detail>
          )}
          {channels.length > 0 && (
            <Detail>
              <DetailLabel>Channels</DetailLabel>
              <DetailValue>
                {scopeValuesData?.channels
                  .filter((channel) => channels.includes(channel.id))
                  .map((channel) => channel.name)
                  .join(", ") ?? channels.join(", ")}
              </DetailValue>
            </Detail>
          )}
        </>
      )}
    </>
  );
};
