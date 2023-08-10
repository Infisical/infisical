import { useState } from "react";
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

export default function HashiCorpVaultCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  const [vaultEnginePath, setVaultEnginePath] = useState("");
  const [vaultEnginePathErrorText, setVaultEnginePathErrorText] = useState("");

  const [vaultSecretPath, setVaultSecretPath] = useState("");
  const [vaultSecretPathErrorText, setVaultSecretPathErrorText] = useState("");

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [isLoading, setIsLoading] = useState(false);

  const isValidVaultPath = (vaultPath: string) => {
    return !(vaultPath.length === 0 || vaultPath.startsWith("/") || vaultPath.endsWith("/"));
  };

  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?._id) return;

      if (!isValidVaultPath(vaultEnginePath)) {
        setVaultEnginePathErrorText("Vault KV Secrets Engine Path must be valid like kv");
      } else {
        setVaultEnginePathErrorText("");
      }

      if (!isValidVaultPath(vaultSecretPath)) {
        setVaultSecretPathErrorText("Vault Secret(s) Path must be valid like machine/dev");
      } else {
        setVaultSecretPathErrorText("");
      }

      if (!isValidVaultPath || !isValidVaultPath(vaultSecretPath)) return;

      setIsLoading(true);

      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: vaultEnginePath,
        appId: null,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: null,
        targetEnvironmentId: null,
        targetService: null,
        targetServiceId: null,
        owner: null,
        path: vaultSecretPath,
        region: null,
        secretPath
      });

      setIsLoading(false);

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth && workspace ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Vault Integration</CardTitle>
        <FormControl label="Project Environment" className="mt-4">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {workspace?.environments.map((sourceEnvironment) => (
              <SelectItem
                value={sourceEnvironment.slug}
                key={`vault-environment-${sourceEnvironment.slug}`}
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
          label="Vault KV Secrets Engine Path"
          errorText={vaultEnginePathErrorText}
          isError={vaultEnginePathErrorText !== "" ?? false}
        >
          <Input
            placeholder="kv"
            value={vaultEnginePath}
            onChange={(e) => setVaultEnginePath(e.target.value)}
          />
        </FormControl>
        <FormControl
          label="Vault Secret(s) Path"
          errorText={vaultSecretPathErrorText}
          isError={vaultSecretPathErrorText !== "" ?? false}
        >
          <Input
            placeholder="machine/dev"
            value={vaultSecretPath}
            onChange={(e) => setVaultSecretPath(e.target.value)}
          />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
          isDisabled={!(isValidVaultPath(vaultEnginePath) && isValidVaultPath(vaultSecretPath))}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div />
  );
}

HashiCorpVaultCreateIntegrationPage.requireAuth = true;
