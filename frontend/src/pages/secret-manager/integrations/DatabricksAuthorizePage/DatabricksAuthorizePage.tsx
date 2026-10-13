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
      <Helmet>
        <title>Authorize Databricks Integration</title>
      </Helmet>
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <div className="flex flex-row items-center">
              <div className="flex items-center pb-0.5">
                <img
                  src="/images/integrations/Databricks.png"
                  height={30}
                  width={30}
                  alt="Databricks logo"
                />
              </div>
              <span className="ml-1.5">Databricks Integration </span>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/docs/integrations/cloud/databricks"
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
            After adding your Access Token, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
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
          <Button
            onClick={handleButtonClick}
            className="mt-2 mr-6 mb-6 ml-auto w-min"
            isPending={isPending}
            isDisabled={isPending}
            variant="project"
          >
            Connect to Databricks
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
