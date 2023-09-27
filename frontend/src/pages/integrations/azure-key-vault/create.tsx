import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import queryString from "query-string";

import {
  useCreateIntegration
} from "@app/hooks/api";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "../../../components/v2";
import { useGetIntegrationAuthById } from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

export default function AzureKeyVaultCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");

  const [vaultBaseUrl, setVaultBaseUrl] = useState("");
  const [vaultBaseUrlErrorText, setVaultBaseUrlErrorText] = useState("");

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

      if (!integrationAuth?._id) return;

      setIsLoading(true);
      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: vaultBaseUrl,
        sourceEnvironment: selectedSourceEnvironment,
        secretPath
      });
      setIsLoading(false);

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
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
          isError={vaultBaseUrlErrorText !== "" ?? false}
        >
          <Input
            placeholder="https://example.vault.azure.net"
            value={vaultBaseUrl}
            onChange={(e) => setVaultBaseUrl(e.target.value)}
          />
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
}

AzureKeyVaultCreateIntegrationPage.requireAuth = true;
