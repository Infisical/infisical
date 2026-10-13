import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const Cloud66AuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      if (apiKey.length === 0) {
        setApiKeyErrorText("Access token cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "cloud-66",
        accessToken: apiKey
      });

      setIsLoading(false);

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/cloud-66/create",
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Cloud 66 Integration</CardTitle>
        </CardHeader>
        <Field className="mb-4" data-invalid={apiKeyErrorText !== ""}>
          <FieldLabel htmlFor="cloud66-cloud-66-personal-access-token">
            Cloud 66 Personal Access Token
          </FieldLabel>
          <Input
            placeholder=""
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            id="cloud66-cloud-66-personal-access-token"
            isError={apiKeyErrorText !== ""}
            aria-describedby={
              apiKeyErrorText !== "" ? "cloud66-cloud-66-personal-access-token-error" : undefined
            }
          />
          {apiKeyErrorText !== "" && (
            <FieldError id="cloud66-cloud-66-personal-access-token-error">
              {apiKeyErrorText}
            </FieldError>
          )}
        </Field>
        <Button
          onClick={handleButtonClick}
          className="mt-4"
          isPending={isLoading}
          variant="outline"
        >
          Connect to Cloud 66
        </Button>
      </Card>
    </div>
  );
};
