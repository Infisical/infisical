import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
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
    } finally {
      setIsLoading(false);
    }
  };

  return integrationAuth && workspace && selectedSourceEnvironment ? (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Azure Key Vault Integration" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Azure Key Vault Integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field className="mt-4" data-invalid={false}>
            <FieldLabel htmlFor="azurekeyvault-project-environment">Project Environment</FieldLabel>
            <Select
              value={selectedSourceEnvironment}
              onValueChange={(val) => setSelectedSourceEnvironment(val)}
            >
              <SelectTrigger className="w-full" id="azurekeyvault-project-environment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workspace?.environments.map((sourceEnvironment) => (
                  <SelectItem
                    value={sourceEnvironment.slug}
                    key={`azure-key-vault-environment-${sourceEnvironment.slug}`}
                  >
                    {sourceEnvironment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={false}>
            <FieldLabel htmlFor="azurekeyvault-secrets-path">Secrets Path</FieldLabel>
            <Input
              value={secretPath}
              onChange={(evt) => setSecretPath(evt.target.value)}
              placeholder="Provide a path, default is /"
              id="azurekeyvault-secrets-path"
            />
          </Field>
          <Field data-invalid={vaultBaseUrlErrorText !== ""}>
            <FieldLabel htmlFor="azurekeyvault-vault-uri">Vault URI</FieldLabel>
            <Input
              placeholder="https://example.vault.azure.net"
              value={vaultBaseUrl}
              onChange={(e) => setVaultBaseUrl(e.target.value)}
              id="azurekeyvault-vault-uri"
              isError={vaultBaseUrlErrorText !== ""}
              aria-describedby={
                vaultBaseUrlErrorText !== "" ? "azurekeyvault-vault-uri-error" : undefined
              }
            />
            {vaultBaseUrlErrorText !== "" && (
              <FieldError id="azurekeyvault-vault-uri-error">{vaultBaseUrlErrorText}</FieldError>
            )}
          </Field>
          <Field data-invalid={false}>
            <FieldLabel htmlFor="azurekeyvault-initial-sync-behavior">
              Initial Sync Behavior
            </FieldLabel>
            <Select
              value={initialSyncBehavior}
              onValueChange={(e) => setInitialSyncBehavior(e as IntegrationSyncBehavior)}
            >
              <SelectTrigger className="w-full" id="azurekeyvault-initial-sync-behavior">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {initialSyncBehaviors.map((b) => {
                  return (
                    <SelectItem value={b.value} key={`sync-behavior-${b.value}`}>
                      {b.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="outline">
            Create Integration
          </Button>
        </CardFooter>
      </Card>
    </div>
  ) : (
    <>
      <PageTitle title="Set Up Azure Key Vault Integration" />
      <div />
    </>
  );
};
