import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const TravisCIAuthorizePage = () => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
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
        workspaceId: currentWorkspace.id,
        integration: "travisci",
        accessToken: apiKey
      });

      setIsLoading(false);

      navigate({
        to: "/secret-manager/$projectId/integrations/travisci/create",
        params: {
          projectId: currentWorkspace.id
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
        <CardTitle className="text-center">Travis CI Integration</CardTitle>
        <FormControl
          label="Travis CI API Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== ""}
        >
          <Input placeholder="" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Connect to Travis CI
        </Button>
      </Card>
    </div>
  );
};
