import { useState } from "react";
import { Helmet } from "react-helmet";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
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
      <Helmet>
        <title>Authorize Azure DevOps Integration</title>
      </Helmet>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <div className="flex flex-row items-center">
              <div className="flex items-center">
                <img
                  src="/images/integrations/Microsoft Azure.png"
                  height={35}
                  width={35}
                  alt="Azure DevOps logo"
                />
              </div>
              <span className="ml-1.5">Azure DevOps Integration </span>
              <a
                target="_blank"
                href="https://infisical.com/docs/integrations/cloud/azure-devops"
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
          <Button
            onClick={handleButtonClick}
            className="mt-2 mr-6 mb-6 ml-auto w-min"
            isPending={isLoading}
            variant="project"
          >
            Connect to Azure DevOps
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
