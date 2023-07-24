import { useState } from "react";
import { useRouter } from "next/router";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";
import saveIntegrationAccessToken from "../../api/integrations/saveIntegrationAccessToken";

export default function ScalewayCreateIntegrationPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [organizationIdErrorText, setOrganizationIdErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setOrganizationIdErrorText("");

      if (apiKey.length === 0) {
        setApiKeyErrorText("Access Token cannot be blank");
        return;
      }
      
      if (organizationId.length === 0) {
        setOrganizationIdErrorText("Server Id cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await saveIntegrationAccessToken({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "scaleway",
        accessId: organizationId,
        accessToken: apiKey,
        url: null,
        namespace: null
      });

      setIsLoading(false);

      router.push(`/integrations/scaleway/create?integrationAuthId=${integrationAuth._id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Scaleway Integration</CardTitle>
        <FormControl
          label="Scaleway Access Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== "" ?? false}
        >
          <Input placeholder="Scaleway Secret Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </FormControl>
        <FormControl
          label="Scaleway Organization ID"
          errorText={organizationIdErrorText}
          isError={organizationIdErrorText !== "" ?? false}
        >
          <Input placeholder="Organization ID" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Connect to Scaleway
        </Button>
      </Card>
    </div>
  );
}

ScalewayCreateIntegrationPage.requireAuth = true;
