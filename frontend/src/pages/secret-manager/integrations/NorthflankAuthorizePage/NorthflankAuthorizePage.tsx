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

export const NorthflankAuthorizePage = () => {
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
        setApiKeyErrorText("API Key cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "northflank",
        accessToken: apiKey
      });

      setIsLoading(false);

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/northflank/create",
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
          <CardTitle>Northflank Integration</CardTitle>
        </CardHeader>
        <Field className="mb-4" data-invalid={apiKeyErrorText !== ""}>
          <FieldLabel htmlFor="NorthflankAuthorizePage-field-1">Northflank API Token</FieldLabel>
          <Input
            id="NorthflankAuthorizePage-field-1"
            aria-describedby="NorthflankAuthorizePage-field-1-feedback"
            isError={apiKeyErrorText !== ""}
            placeholder=""
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          {apiKeyErrorText !== "" && (
            <FieldError id="NorthflankAuthorizePage-field-1-feedback">{apiKeyErrorText}</FieldError>
          )}
        </Field>
        <Button
          onClick={handleButtonClick}
          className="mt-4"
          isPending={isLoading}
          variant="project"
        >
          Connect to Northflank
        </Button>
      </Card>
    </div>
  );
};
