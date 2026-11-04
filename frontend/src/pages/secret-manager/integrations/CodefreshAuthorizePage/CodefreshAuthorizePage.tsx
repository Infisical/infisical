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

export const CodefreshAuthorizePage = () => {
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
        integration: "codefresh",
        accessToken: apiKey
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/codefresh/create",
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
      <PageTitle title="Authorize Codefresh Integration" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Codefresh Integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="codefresh-codefresh-api-key">Codefresh API Key</FieldLabel>
            <Input
              placeholder=""
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              id="codefresh-codefresh-api-key"
              isError={apiKeyErrorText !== ""}
              aria-describedby={
                apiKeyErrorText !== "" ? "codefresh-codefresh-api-key-error" : undefined
              }
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="codefresh-codefresh-api-key-error">{apiKeyErrorText}</FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="outline">
            Connect to Codefresh
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
