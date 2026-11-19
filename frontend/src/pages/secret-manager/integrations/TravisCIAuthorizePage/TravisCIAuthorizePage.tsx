import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
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

export const TravisCIAuthorizePage = () => {
  const navigate = useNavigate();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { mutateAsync, isPending: isLoading } = useSaveIntegrationAccessToken();

  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      if (apiKey.length === 0) {
        setApiKeyErrorText("API Key cannot be blank");
        return;
      }

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "travisci",
        accessToken: apiKey
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/travisci/create",
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
      <PageTitle title="Authorize Travis CI Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Travis CI Integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="TravisCIAuthorizePage-field-1">Travis CI API Token</FieldLabel>
            <Input
              id="TravisCIAuthorizePage-field-1"
              aria-describedby="TravisCIAuthorizePage-field-1-feedback"
              isError={apiKeyErrorText !== ""}
              placeholder=""
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="TravisCIAuthorizePage-field-1-feedback">{apiKeyErrorText}</FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Connect to Travis CI
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
