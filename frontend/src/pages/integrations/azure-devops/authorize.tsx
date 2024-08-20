import { useState } from "react";
import { useRouter } from "next/router";

import { useSaveIntegrationAccessToken } from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function AzureDevopsCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const [apiKey, setApiKey] = useState("");
  const [devopsOrgName, setDevopsOrgName] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      if (apiKey.length === 0) {
        setApiKeyErrorText("API Key cannot be blank");
        return;
      }

      setIsLoading(true);

      localStorage.setItem("azure-devops-org-name", devopsOrgName);

      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "azure-devops",
        accessToken: btoa(`:${apiKey}`) // This is a base64 encoding of the API key without any username
      });

      setIsLoading(false);

      router.push(`/integrations/azure-devops/create?integrationAuthId=${integrationAuth.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">AzureDevops Integration</CardTitle>
        <FormControl
          label="AzureDevops API Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== "" ?? false}
        >
          <Input placeholder="" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </FormControl>
        <FormControl
          label="AzureDevops Organization Name"
          tooltipText="This is not the organization ID, but the slug of the organization. An example would be 'my-acme-org'"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== "" ?? false}
        >
          <Input
            placeholder=""
            value={devopsOrgName}
            onChange={(e) => setDevopsOrgName(e.target.value)}
          />
        </FormControl>

        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Connect to AzureDevOps
        </Button>
      </Card>
    </div>
  );
}

AzureDevopsCreateIntegrationPage.requireAuth = true;
