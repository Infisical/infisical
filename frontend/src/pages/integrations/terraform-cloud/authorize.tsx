import { useState } from "react";
import { useRouter } from "next/router";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";
import saveIntegrationAccessToken from "../../api/integrations/saveIntegrationAccessToken";

export default function TerraformCloudCreateIntegrationPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [workspacesId, setWorkSpacesId] = useState("");
  const [workspacesIdErrorText, setWorkspacesIdErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setWorkspacesIdErrorText("");

      if (apiKey.length === 0) {
        setApiKeyErrorText("API Token cannot be blank");
        return;
      }
      
      if (workspacesId.length === 0) {
        setWorkspacesIdErrorText("Workspace Id cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await saveIntegrationAccessToken({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "terraform-cloud",
        accessId: workspacesId,
        accessToken: apiKey,
        url: null,
        namespace: null
      });

      setIsLoading(false);

      router.push(`/integrations/terraform-cloud/create?integrationAuthId=${integrationAuth._id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Terraform Cloud Integration</CardTitle>
        <FormControl
          label="Terraform Cloud API Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== "" ?? false}
        >
          <Input placeholder="API Token" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </FormControl>
        <FormControl
          label="Terraform Cloud Workspace ID"
          errorText={workspacesIdErrorText}
          isError={workspacesIdErrorText !== "" ?? false}
        >
          <Input placeholder="Workspace Id" value={workspacesId} onChange={(e) => setWorkSpacesId(e.target.value)} />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Connect to Terraform Cloud
        </Button>
      </Card>
    </div>
  );
}

TerraformCloudCreateIntegrationPage.requireAuth = true;
