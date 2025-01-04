import { FormLabel, Spinner } from "@app/components/v2";
import { useGetIntegrationAuthOctopusDeployScopeValues } from "@app/hooks/api/integrationAuth/queries";
import {
  OctopusDeployScope,
  TOctopusDeployVariableSetScopeValues
} from "@app/hooks/api/integrationAuth/types";
import { TIntegration, TOctopusDeployScopeValues } from "@app/hooks/api/integrations/types";

type OctopusDeployScopeValuesProps = {
  integration: TIntegration;
};

// remove plural since Octopus Deploy can decide whether they want to use singular or plural...
const modifyKey = (key: keyof TOctopusDeployVariableSetScopeValues) => {
  switch (key) {
    case "Processes":
      return "ProcessOwner";
    default:
      return key.substring(0, key.length - 1);
  }
};

export const OctopusDeployScopeValues = ({ integration }: OctopusDeployScopeValuesProps) => {
  const hasScopeValues = Boolean(
    Object.values(integration.metadata?.octopusDeployScopeValues ?? {}).some(
      (values) => values.length > 0
    )
  );

  const { data: scopeValues = {}, isPending } = useGetIntegrationAuthOctopusDeployScopeValues(
    {
      scope: OctopusDeployScope.Project,
      spaceId: integration.targetEnvironmentId!,
      resourceId: integration.appId!,
      integrationAuthId: integration.integrationAuthId
    },
    {
      enabled: hasScopeValues
    }
  );

  if (!integration.metadata?.octopusDeployScopeValues)
    return <span className="text-sm text-mineshaft-400">Not Configured</span>;

  if (isPending) return <Spinner size="sm" className="ml-2 mt-2" />;

  const scopeValuesMap = new Map(
    Object.entries(scopeValues).map(([key, values]) => [
      modifyKey(key as keyof TOctopusDeployVariableSetScopeValues),
      new Map((values as { Name: string; Id: string }[]).map((value) => [value.Id, value.Name]))
    ])
  );

  return (
    <>
      {Object.entries(integration.metadata.octopusDeployScopeValues).map(([key, values]) => {
        if (!values.length) return null;

        const getLabel = (scope: string) => {
          switch (scope as keyof TOctopusDeployScopeValues) {
            case "Role":
              return "Target Tags";
            case "Machine":
              return "Targets";
            case "ProcessOwner":
              return "Processes";
            case "Action":
              return "Steps";
            default:
              return `${scope}s`;
          }
        };

        return (
          <div className="mt-4" key={key}>
            <FormLabel className="text-sm font-semibold text-mineshaft-200" label={getLabel(key)} />

            <div className="text-sm text-mineshaft-300">
              {values
                .map((value) => scopeValuesMap.get(key)?.get(value))
                .map((name) => (
                  <p key={name}>{name}</p>
                ))}
            </div>
          </div>
        );
      })}
    </>
  );
};
