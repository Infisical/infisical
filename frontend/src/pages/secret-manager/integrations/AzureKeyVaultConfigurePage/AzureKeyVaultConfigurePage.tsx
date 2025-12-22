import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import { useGetIntegrationAuthById } from "@app/hooks/api/integrationAuth";
import { IntegrationSyncBehavior } from "@app/hooks/api/integrations/types";
import { useGetWorkspaceById } from "@app/hooks/api/projects";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const initialSyncBehaviors = [
  {
    label: "No Import - Overwrite all values in Azure Vault",
    value: IntegrationSyncBehavior.OVERWRITE_TARGET
  },
  {
    label: "Import - Prefer values from Azure Vault",
    value: IntegrationSyncBehavior.PREFER_TARGET
  },
  { label: "Import - Prefer values from Infisical", value: IntegrationSyncBehavior.PREFER_SOURCE }
];

export const AzureKeyVaultConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.AzureKeyVaultConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { currentProject } = useProject();

  const { data: workspace } = useGetWorkspaceById(currentProject.id);
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");

  const [vaultBaseUrl, setVaultBaseUrl] = useState("");
  const [vaultBaseUrlErrorText, setVaultBaseUrlErrorText] = useState("");
  const [initialSyncBehavior, setInitialSyncBehavior] = useState(
    IntegrationSyncBehavior.PREFER_SOURCE
  );

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  const handleButtonClick = async () => {
    try {
      if (vaultBaseUrl.length === 0) {
        setVaultBaseUrlErrorText("Vault URI cannot be blank");
        return;
      }

      if (!vaultBaseUrl.startsWith("https://") || !vaultBaseUrl.endsWith("vault.azure.net")) {
        setVaultBaseUrlErrorText("Vault URI must be like https://<vault_name>.vault.azure.net");
        return;
      }

      if (!integrationAuth?.id) return;

      setIsLoading(true);
      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: vaultBaseUrl,
        sourceEnvironment: selectedSourceEnvironment,
        secretPath,
        metadata: {
          initialSyncBehavior
        }
      });
      setIsLoading(false);

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search: {
          selectedTab: IntegrationsListPageTabs.NativeIntegrations
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth && workspace && selectedSourceEnvironment ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Azure Key Vault Integration</CardTitle>
        <FormControl label="Project Environment" className="mt-4">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {workspace?.environments.map((sourceEnvironment) => (
              <SelectItem
                value={sourceEnvironment.slug}
                key={`azure-key-vault-environment-${sourceEnvironment.slug}`}
              >
                {sourceEnvironment.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <FormControl label="Secrets Path">
          <Input
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </FormControl>
        <FormControl
          label="Vault URI"
          errorText={vaultBaseUrlErrorText}
          isError={vaultBaseUrlErrorText !== ""}
        >
          <Input
            placeholder="https://example.vault.azure.net"
            value={vaultBaseUrl}
            onChange={(e) => setVaultBaseUrl(e.target.value)}
          />
        </FormControl>
        <FormControl label="Initial Sync Behavior">
          <Select
            value={initialSyncBehavior}
            onValueChange={(e) => setInitialSyncBehavior(e as IntegrationSyncBehavior)}
            className="w-full"
          >
            {initialSyncBehaviors.map((b) => {
              return (
                <SelectItem value={b.value} key={`sync-behavior-${b.value}`}>
                  {b.label}
                </SelectItem>
              );
            })}
          </Select>
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div />
  );
};
