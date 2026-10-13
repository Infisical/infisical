import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Laravel Forge Integration</CardTitle>
        </CardHeader>
        <Field className="mb-4" data-invalid={apiKeyErrorText !== ""}>
          <FieldLabel htmlFor="LaravelForgeAuthorizePage-field-1">
            Laravel Forge Access Token
          </FieldLabel>
          <Input
            id="LaravelForgeAuthorizePage-field-1"
            aria-describedby="LaravelForgeAuthorizePage-field-1-feedback"
            isError={apiKeyErrorText !== ""}
            placeholder="Access Token"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          {apiKeyErrorText !== "" && (
            <FieldError id="LaravelForgeAuthorizePage-field-1-feedback">
              {apiKeyErrorText}
            </FieldError>
          )}
        </Field>
        <Field className="mb-4" data-invalid={serverIdErrorText !== ""}>
          <FieldLabel htmlFor="LaravelForgeAuthorizePage-field-2">
            Laravel Forge Server ID
          </FieldLabel>
          <Input
            id="LaravelForgeAuthorizePage-field-2"
            aria-describedby="LaravelForgeAuthorizePage-field-2-feedback"
            isError={serverIdErrorText !== ""}
            placeholder="123456"
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
          />
          {serverIdErrorText !== "" && (
            <FieldError id="LaravelForgeAuthorizePage-field-2-feedback">
              {serverIdErrorText}
            </FieldError>
          )}
        </Field>
        <Button
          onClick={handleButtonClick}
          className="mt-4"
          isPending={isLoading}
          variant="project"
        >
          Connect to Laravel Forge
        </Button>
      </Card>
    </div>
  );
};
