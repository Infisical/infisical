import { useState } from "react";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const AzureDevopsAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
  const [apiKey, setApiKey] = useState("");
  const [devopsOrgName, setDevopsOrgName] = useState("");
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

      localStorage.setItem("azure-devops-org-name", devopsOrgName);

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "azure-devops",
        accessToken: btoa(`:${apiKey}`) // This is a base64 encoding of the API key without any username
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/azure-devops/create",
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
      <PageTitle title="Authorize Azure DevOps Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/Microsoft Azure.png"
              height={35}
              width={35}
              alt="Azure DevOps logo"
            />
            <span>Azure DevOps Integration</span>
          </CardTitle>
          <CardDescription>
            After adding the details below, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                target="_blank"
                href="https://infisical.com/docs/integrations/cloud/azure-devops"
                rel="noopener noreferrer"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {" "}
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="azuredevops-azure-devops-api-token">
              Azure DevOps API Token
            </FieldLabel>
            <Input
              placeholder=""
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              id="azuredevops-azure-devops-api-token"
              isError={apiKeyErrorText !== ""}
              aria-describedby={
                apiKeyErrorText !== "" ? "azuredevops-azure-devops-api-token-error" : undefined
              }
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="azuredevops-azure-devops-api-token-error">
                {apiKeyErrorText}
              </FieldError>
            )}
          </Field>
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="azuredevops-azure-devops-organization-name">
              Azure DevOps Organization Name
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="More information">
                    ?
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  This is the slug of the organization. An example would be &apos;my-acme-org&apos;
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input
              placeholder=""
              value={devopsOrgName}
              onChange={(e) => setDevopsOrgName(e.target.value)}
              id="azuredevops-azure-devops-organization-name"
              isError={apiKeyErrorText !== ""}
              aria-describedby={
                apiKeyErrorText !== ""
                  ? "azuredevops-azure-devops-organization-name-error"
                  : undefined
              }
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="azuredevops-azure-devops-organization-name-error">
                {apiKeyErrorText}
              </FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Connect to Azure DevOps
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
