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

export const ChecklyAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const [accessToken, setAccessToken] = useState("");
  const [accessTokenErrorText, setAccessTokenErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setAccessTokenErrorText("");
      if (accessToken.length === 0) {
        setAccessTokenErrorText("Access token cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "checkly",
        accessToken
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/checkly/create",
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
      <PageTitle title="Authorize Checkly Integration" />
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img src="/images/integrations/Checkly.png" height={30} width={30} alt="Checkly logo" />
            <span>Checkly Integration</span>
          </CardTitle>
          <CardDescription>
            After adding your API key, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/docs/integrations/cloud/checkly"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field data-invalid={accessTokenErrorText !== ""}>
            <FieldLabel htmlFor="checkly-checkly-api-key">Checkly API key</FieldLabel>
            <Input
              placeholder=""
              value={accessToken}
              type="password"
              autoComplete="new-password"
              onChange={(e) => setAccessToken(e.target.value)}
              id="checkly-checkly-api-key"
              isError={accessTokenErrorText !== ""}
              aria-describedby={
                accessTokenErrorText !== "" ? "checkly-checkly-api-key-error" : undefined
              }
            />
            {accessTokenErrorText !== "" && (
              <FieldError id="checkly-checkly-api-key-error">{accessTokenErrorText}</FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Connect to Checkly
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
