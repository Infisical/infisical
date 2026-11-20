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

export const RailwayAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending: isLoading } = useSaveIntegrationAccessToken();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
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
        integration: "railway",
        accessToken: apiKey
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/railway/create",
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
      <PageTitle title="Authorize Railway Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Railway Integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="RailwayAuthorizePage-field-1">Railway API Key</FieldLabel>
            <Input
              id="RailwayAuthorizePage-field-1"
              aria-describedby="RailwayAuthorizePage-field-1-feedback"
              isError={apiKeyErrorText !== ""}
              placeholder=""
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="RailwayAuthorizePage-field-1-feedback">{apiKeyErrorText}</FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Connect to Railway
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
