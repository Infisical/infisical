import { useState } from "react";
import { useRouter } from "next/router";

import {
  useSaveIntegrationAccessToken
} from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function DigitalOceanAppPlatformCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  
  const [apiKey, setApiKey] = useState("");
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

      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "digital-ocean-app-platform",
        accessToken: apiKey
      });

      setIsLoading(false);

      router.push(`/integrations/digital-ocean-app-platform/create?integrationAuthId=${integrationAuth._id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Digital Ocean App Platform Integration</CardTitle>
        <FormControl
          label="Digital Ocean API Key"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== "" ?? false}
        >
          <Input placeholder="" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Connect to Digital Ocean App Platform
        </Button>
      </Card>
    </div>
  );
}

DigitalOceanAppPlatformCreateIntegrationPage.requireAuth = true;
