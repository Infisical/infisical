import { GenericFieldLabel } from "@app/components/secret-syncs";
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
      <GenericFieldLabel label="Space">{spaceName || spaceId}</GenericFieldLabel>
      <GenericFieldLabel label="Scope" className="capitalize">
        {scope}
      </GenericFieldLabel>
      {scope === OctopusDeploySyncScope.Project && (
        <GenericFieldLabel label="Project">{projectName || projectId}</GenericFieldLabel>
      )}
      {isFetched && (
        <>
          {environments.length > 0 && (
            <GenericFieldLabel label="Environments">
              {scopeValuesData?.environments
                .filter((env) => environments.includes(env.id))
                .map((env) => env.name)
                .join(", ") ?? environments.join(", ")}
            </GenericFieldLabel>
          )}
          {roles.length > 0 && (
            <GenericFieldLabel label="Target Tags">
              {scopeValuesData?.roles
                .filter((role) => roles.includes(role.id))
                .map((role) => role.name)
                .join(", ") ?? roles.join(", ")}
            </GenericFieldLabel>
          )}
          {machines.length > 0 && (
            <GenericFieldLabel label="Targets">
              {scopeValuesData?.machines
                .filter((machine) => machines.includes(machine.id))
                .map((machine) => machine.name)
                .join(", ") ?? machines.join(", ")}
            </GenericFieldLabel>
          )}
          {processes.length > 0 && (
            <GenericFieldLabel label="Processes">
              {scopeValuesData?.processes
                .filter((process) => processes.includes(process.id))
                .map((process) => process.name)
                .join(", ") ?? processes.join(", ")}
            </GenericFieldLabel>
          )}
          {actions.length > 0 && (
            <GenericFieldLabel label="Deployment Steps">
              {scopeValuesData?.actions
                .filter((action) => actions.includes(action.id))
                .map((action) => action.name)
                .join(", ") ?? actions.join(", ")}
            </GenericFieldLabel>
          )}
          {channels.length > 0 && (
            <GenericFieldLabel label="Channels">
              {scopeValuesData?.channels
                .filter((channel) => channels.includes(channel.id))
                .map((channel) => channel.name)
                .join(", ") ?? channels.join(", ")}
            </GenericFieldLabel>
          )}
        </>
      )}
    </>
  );
};
