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

export const CircleCIAuthorizePage = () => {
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
        integration: "circleci",
        accessToken: apiKey
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/circleci/create",
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
      <PageTitle title="Authorize CircleCI Integration" />
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/CircleCI.png"
              height={30}
              width={30}
              alt="CircleCI logo"
            />
            <span>CircleCI Integration</span>
          </CardTitle>
          <CardDescription>
            After adding your API Token, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/docs/integrations/cicd/circleci"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="circleci-circleci-api-token">CircleCI API Token</FieldLabel>
            <Input
              placeholder=""
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              id="circleci-circleci-api-token"
              isError={apiKeyErrorText !== ""}
              aria-describedby={
                apiKeyErrorText !== "" ? "circleci-circleci-api-token-error" : undefined
              }
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="circleci-circleci-api-token-error">{apiKeyErrorText}</FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Connect to CircleCI
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
