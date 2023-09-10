import { useState } from "react";
import { useRouter } from "next/router";

import {
  useSaveIntegrationAccessToken
} from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function LaravelForgeCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [serverId, setServerId] = useState("");
  const [serverIdErrorText, setServerIdErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setServerIdErrorText("");

      if (apiKey.length === 0) {
        setApiKeyErrorText("Access Token cannot be blank");
        return;
      }
      
      if (serverId.length === 0) {
        setServerIdErrorText("Server Id cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "laravel-forge",
        accessId: serverId,
        accessToken: apiKey
      });

      setIsLoading(false);

      router.push(`/integrations/laravel-forge/create?integrationAuthId=${integrationAuth._id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Laravel Forge Integration</CardTitle>
        <FormControl
          label="Laravel Forge Access Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== "" ?? false}
        >
          <Input placeholder="Access Token" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </FormControl>
        <FormControl
          label="Laravel Forge Server ID"
          errorText={serverIdErrorText}
          isError={serverIdErrorText !== "" ?? false}
        >
          <Input placeholder="123456" value={serverId} onChange={(e) => setServerId(e.target.value)} />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Connect to Laravel Forge
        </Button>
      </Card>
    </div>
  );
}

LaravelForgeCreateIntegrationPage.requireAuth = true;
