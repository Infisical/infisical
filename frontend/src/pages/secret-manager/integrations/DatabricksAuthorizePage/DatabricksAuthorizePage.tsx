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
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const DatabricksAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
  const [apiKey, setApiKey] = useState("");
  const [instanceURL, setInstanceURL] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [instanceURLErrorText, setInstanceURLErrorText] = useState("");

  const { currentProject } = useProject();

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setInstanceURLErrorText("");
      if (apiKey.length === 0) {
        setApiKeyErrorText("API Key cannot be blank");
        return;
      }
      if (instanceURL.length === 0) {
        setInstanceURLErrorText("Instance URL cannot be blank");
        return;
      }

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "databricks",
        url: instanceURL.replace(/\/$/, ""),
        accessToken: apiKey
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/databricks/create",
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
      <PageTitle title="Authorize Databricks Integration" />
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/Databricks.png"
              height={30}
              width={30}
              alt="Databricks logo"
            />
            <span>Databricks Integration</span>
          </CardTitle>
          <CardDescription>
            After adding your Access Token, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/docs/integrations/cloud/databricks"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field data-invalid={instanceURLErrorText !== ""}>
            <FieldLabel htmlFor="databricks-databricks-instance-url">
              Databricks Instance URL
            </FieldLabel>
            <Input
              value={instanceURL}
              onChange={(e) => setInstanceURL(e.target.value)}
              placeholder="https://xxxx.cloud.databricks.com"
              id="databricks-databricks-instance-url"
              isError={instanceURLErrorText !== ""}
              aria-describedby={
                instanceURLErrorText !== "" ? "databricks-databricks-instance-url-error" : undefined
              }
            />
            {instanceURLErrorText !== "" && (
              <FieldError id="databricks-databricks-instance-url-error">
                {instanceURLErrorText}
              </FieldError>
            )}
          </Field>
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="databricks-access-token">Access Token</FieldLabel>
            <Input
              placeholder=""
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
              id="databricks-access-token"
              isError={apiKeyErrorText !== ""}
              aria-describedby={
                apiKeyErrorText !== "" ? "databricks-access-token-error" : undefined
              }
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="databricks-access-token-error">{apiKeyErrorText}</FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            onClick={handleButtonClick}
            isPending={isPending}
            isDisabled={isPending}
            variant="project"
          >
            Connect to Databricks
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
