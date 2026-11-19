import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const RenderAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending: isLoading } = useSaveIntegrationAccessToken();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      if (apiKey.length === 0) {
        setApiKeyErrorText("API Key cannot be blank");
        return;
      }

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "render",
        accessToken: apiKey
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/render/create",
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
      <PageTitle title="Authorize Render Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img src="/images/integrations/Render.png" height={30} width={30} alt="Render logo" />
            Render Integration
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/render" />
          </CardTitle>
          <CardDescription>
            After adding your API key, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="RenderAuthorizePage-field-1">Render API Key</FieldLabel>
            <Input
              id="RenderAuthorizePage-field-1"
              aria-describedby="RenderAuthorizePage-field-1-feedback"
              isError={apiKeyErrorText !== ""}
              placeholder="rnd_xxx"
              value={apiKey}
              type="password"
              autoComplete="new-password"
              onChange={(e) => setApiKey(e.target.value)}
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="RenderAuthorizePage-field-1-feedback">{apiKeyErrorText}</FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Connect to Render
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
