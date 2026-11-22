import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const DigitalOceanAppPlatformAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { currentProject } = useProject();

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      if (apiKey.length === 0) {
        setApiKeyErrorText("API Key cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "digital-ocean-app-platform",
        accessToken: apiKey
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/digital-ocean-app-platform/create",
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
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Authorize DigitalOcean App Platform Integration" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Digital Ocean App Platform Integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="digitaloceanappplatform-digital-ocean-api-key">
              Digital Ocean API Key
            </FieldLabel>
            <Input
              placeholder=""
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              id="digitaloceanappplatform-digital-ocean-api-key"
              isError={apiKeyErrorText !== ""}
              aria-describedby={
                apiKeyErrorText !== ""
                  ? "digitaloceanappplatform-digital-ocean-api-key-error"
                  : undefined
              }
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="digitaloceanappplatform-digital-ocean-api-key-error">
                {apiKeyErrorText}
              </FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="outline">
            Connect to Digital Ocean App Platform
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
