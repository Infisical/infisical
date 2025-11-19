import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const LaravelForgeAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
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
        workspaceId: currentProject.id,
        integration: "laravel-forge",
        accessId: serverId,
        accessToken: apiKey
      });

      setIsLoading(false);

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/laravel-forge/create",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search: {
          integrationAuthId: integrationAuth.id
        }
      });
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
          isError={apiKeyErrorText !== ""}
        >
          <Input
            placeholder="Access Token"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </FormControl>
        <FormControl
          label="Laravel Forge Server ID"
          errorText={serverIdErrorText}
          isError={serverIdErrorText !== ""}
        >
          <Input
            placeholder="123456"
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
          />
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
};
