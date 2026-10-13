import { useState } from "react";
import { Helmet } from "react-helmet";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
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
      <Helmet>
        <title>Authorize TeamCity Integration</title>
      </Helmet>
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <div className="flex flex-row items-center">
              <div className="flex items-center pb-0.5">
                <img
                  src="/images/integrations/TeamCity.png"
                  height={28}
                  width={28}
                  alt="TeamCity logo"
                />
              </div>
              <span className="ml-2">TeamCity Integration</span>
              <a
                target="_blank"
                href="https://infisical.com/docs/integrations/cloud/teamcity"
                rel="noopener noreferrer"
              >
                <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-warning/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-warning opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="text-xxs mb-[0.07rem] ml-1.5"
                  />
                </div>
              </a>
            </div>
          </CardTitle>
          <CardDescription>
            After adding the details below, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
        </CardHeader>
        <Field className="mb-4 px-6" data-invalid={apiKeyErrorText !== ""}>
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
        <Field className="mb-4 px-6" data-invalid={serverUrlErrorText !== ""}>
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
        <Button
          onClick={handleButtonClick}
          className="mt-2 mr-6 mb-6 ml-auto w-min"
          isPending={isLoading}
          variant="project"
        >
          Connect to TeamCity
        </Button>
      </Card>
    </div>
  );
};
