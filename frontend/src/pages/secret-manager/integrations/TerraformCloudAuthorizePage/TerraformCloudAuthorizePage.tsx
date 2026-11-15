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

export const TerraformCloudAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending: isLoading } = useSaveIntegrationAccessToken();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [workspacesId, setWorkSpacesId] = useState("");
  const [workspacesIdErrorText, setWorkspacesIdErrorText] = useState("");

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

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "terraform-cloud",
        accessId: workspacesId,
        accessToken: apiKey
      });

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
      <PageTitle title="Authorize Terraform Cloud Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/Terraform.png"
              height={35}
              width={35}
              alt="Terraform logo"
            />
            Terraform Cloud Integration
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/terraform-cloud" />
          </CardTitle>
          <CardDescription>
            After adding the details below, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={workspacesIdErrorText !== ""}>
            <FieldLabel htmlFor="TerraformCloudAuthorizePage-field-1">
              Terraform Cloud Workspace ID
            </FieldLabel>
            <Input
              id="TerraformCloudAuthorizePage-field-1"
              aria-describedby="TerraformCloudAuthorizePage-field-1-feedback"
              isError={workspacesIdErrorText !== ""}
              placeholder="Workspace Id"
              value={workspacesId}
              onChange={(e) => setWorkSpacesId(e.target.value)}
            />
            {workspacesIdErrorText !== "" && (
              <FieldError id="TerraformCloudAuthorizePage-field-1-feedback">
                {workspacesIdErrorText}
              </FieldError>
            )}
          </Field>
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="TerraformCloudAuthorizePage-field-2">
              Terraform Cloud API Token
            </FieldLabel>
            <Input
              id="TerraformCloudAuthorizePage-field-2"
              aria-describedby="TerraformCloudAuthorizePage-field-2-feedback"
              isError={apiKeyErrorText !== ""}
              placeholder="API Token"
              value={apiKey}
              type="password"
              autoComplete="new-password"
              onChange={(e) => setApiKey(e.target.value)}
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="TerraformCloudAuthorizePage-field-2-feedback">
                {apiKeyErrorText}
              </FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Connect to Terraform Cloud
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
