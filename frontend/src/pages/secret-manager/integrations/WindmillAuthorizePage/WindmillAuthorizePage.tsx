import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const WindmillAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentWorkspace } = useWorkspace();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [apiUrlErrorText, setApiUrlErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setApiUrlErrorText("");
      if (apiKey.length === 0) {
        setApiKeyErrorText("API Key cannot be blank");
        return;
      }

      if (apiUrl && !apiUrl.startsWith("http://") && !apiUrl.startsWith("https://")) {
        setApiUrlErrorText("API URL must start with http:// or https://");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentWorkspace.id,
        integration: "windmill",
        accessToken: apiKey,
        url: apiUrl ?? undefined
      });

      setIsLoading(false);

      navigate({
        to: "/secret-manager/$projectId/integrations/windmill/create",
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
        <CardTitle className="text-center">Windmill Integration</CardTitle>
        <FormControl
          label="Windmill Access Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== ""}
        >
          <Input placeholder="" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </FormControl>
        <FormControl
          label="Windmill Instance URL"
          errorText={apiUrlErrorText}
          isError={apiUrlErrorText !== ""}
          tooltipText="If you are using a custom domain, enter it here. Otherwise, leave it blank."
        >
          <Input
            value={apiUrl ?? ""}
            onChange={(e) => setApiUrl(e.target.value.trim() === "" ? null : e.target.value.trim())}
            placeholder="https://xxxx.windmill.dev"
          />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Connect to Windmill
        </Button>
      </Card>
    </div>
  );
};
