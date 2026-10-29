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

export const TeamcityAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending: isLoading } = useSaveIntegrationAccessToken();

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [serverUrlErrorText, setServerUrlErrorText] = useState("");

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setServerUrlErrorText("");

      if (apiKey.length === 0) {
        setApiKeyErrorText("Access Token cannot be blank");
        return;
      }

      if (serverUrl.length === 0) {
        setServerUrlErrorText("Server URL cannot be blank");
        return;
      }

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "teamcity",
        accessToken: apiKey,
        url: serverUrl
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/teamcity/create",
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
      <PageTitle title="Authorize TeamCity Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/TeamCity.png"
              height={28}
              width={28}
              alt="TeamCity logo"
            />
            TeamCity Integration
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/teamcity" />
          </CardTitle>
          <CardDescription>
            After adding the details below, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="TeamcityAuthorizePage-field-1">TeamCity Access Token</FieldLabel>
            <Input
              id="TeamcityAuthorizePage-field-1"
              aria-describedby="TeamcityAuthorizePage-field-1-feedback"
              isError={apiKeyErrorText !== ""}
              placeholder="Access Token"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="TeamcityAuthorizePage-field-1-feedback">{apiKeyErrorText}</FieldError>
            )}
          </Field>
          <Field data-invalid={serverUrlErrorText !== ""}>
            <FieldLabel htmlFor="TeamcityAuthorizePage-field-2">TeamCity Server URL</FieldLabel>
            <Input
              id="TeamcityAuthorizePage-field-2"
              aria-describedby="TeamcityAuthorizePage-field-2-feedback"
              isError={serverUrlErrorText !== ""}
              placeholder="https://example.teamcity.com"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
            {serverUrlErrorText !== "" && (
              <FieldError id="TeamcityAuthorizePage-field-2-feedback">
                {serverUrlErrorText}
              </FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Connect to TeamCity
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
