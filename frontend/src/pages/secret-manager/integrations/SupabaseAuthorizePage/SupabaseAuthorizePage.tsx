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

export const SupabaseAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

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
        integration: "supabase",
        accessToken: apiKey
      });

      setIsLoading(false);

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/supabase/create",
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
          <CardTitle>Supabase Integration</CardTitle>
        </CardHeader>
        <Field className="mb-4" data-invalid={apiKeyErrorText !== ""}>
          <FieldLabel htmlFor="SupabaseAuthorizePage-field-1">Supabase API Token</FieldLabel>
          <Input
            id="SupabaseAuthorizePage-field-1"
            aria-describedby="SupabaseAuthorizePage-field-1-feedback"
            isError={apiKeyErrorText !== ""}
            placeholder=""
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          {apiKeyErrorText !== "" && (
            <FieldError id="SupabaseAuthorizePage-field-1-feedback">{apiKeyErrorText}</FieldError>
          )}
        </Field>
        <Button
          onClick={handleButtonClick}
          className="mt-4"
          isPending={isLoading}
          variant="project"
        >
          Connect to Supabase
        </Button>
      </Card>
    </div>
  );
};
