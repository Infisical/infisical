import { useState } from "react";
import { Helmet } from "react-helmet";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const TerraformCloudAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [workspacesId, setWorkSpacesId] = useState("");
  const [workspacesIdErrorText, setWorkspacesIdErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setWorkspacesIdErrorText("");

      if (apiKey.length === 0) {
        setApiKeyErrorText("API Token cannot be blank");
        return;
      }

      if (workspacesId.length === 0) {
        setWorkspacesIdErrorText("Workspace Id cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "terraform-cloud",
        accessId: workspacesId,
        accessToken: apiKey
      });

      setIsLoading(false);

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/terraform-cloud/create",
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
        <title>Authorize Terraform Cloud Integration</title>
      </Helmet>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After adding the details below, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <img
                src="/images/integrations/Terraform.png"
                height={35}
                width={35}
                alt="Terraform logo"
              />
            </div>
            <span className="ml-1.5">Terraform Cloud Integration </span>
            <a
              target="_blank"
              href="https://infisical.com/docs/integrations/cloud/terraform-cloud"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
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
        <FormControl
          label="Terraform Cloud Workspace ID"
          errorText={workspacesIdErrorText}
          isError={workspacesIdErrorText !== ""}
          className="px-6"
        >
          <Input
            placeholder="Workspace Id"
            value={workspacesId}
            onChange={(e) => setWorkSpacesId(e.target.value)}
          />
        </FormControl>
        <FormControl
          label="Terraform Cloud API Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== ""}
          className="px-6"
        >
          <Input
            placeholder="API Token"
            value={apiKey}
            type="password"
            autoComplete="new-password"
            onChange={(e) => setApiKey(e.target.value)}
          />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          colorSchema="primary"
          variant="outline_bg"
          className="mt-2 mr-6 mb-6 ml-auto w-min"
          isLoading={isLoading}
        >
          Connect to Terraform Cloud
        </Button>
      </Card>
    </div>
  );
};
