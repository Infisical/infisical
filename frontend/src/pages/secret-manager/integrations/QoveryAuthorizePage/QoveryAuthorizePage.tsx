import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const QoveryAuthorizePage = () => {
  const navigate = useNavigate();
  const { currentProject } = useProject();
  const { mutateAsync, isPending: isLoading } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
  const [accessToken, setAccessToken] = useState("");
  const [accessTokenErrorText, setAccessTokenErrorText] = useState("");

  const handleButtonClick = async () => {
    try {
      setAccessTokenErrorText("");
      if (accessToken.length === 0) {
        setAccessTokenErrorText("Access token cannot be blank");
        return;
      }

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "qovery",
        accessToken
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/qovery/create",
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
      <PageTitle title="Authorize Qovery Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img src="/images/integrations/Qovery.png" height={30} width={30} alt="Qovery logo" />
            Qovery Integration
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/qovery" />
          </CardTitle>
          <CardDescription>
            After adding your API key, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={accessTokenErrorText !== ""}>
            <FieldLabel htmlFor="QoveryAuthorizePage-field-1">Qovery API token</FieldLabel>
            <Input
              id="QoveryAuthorizePage-field-1"
              aria-describedby="QoveryAuthorizePage-field-1-feedback"
              isError={accessTokenErrorText !== ""}
              placeholder=""
              value={accessToken}
              type="password"
              autoComplete="new-password"
              onChange={(e) => setAccessToken(e.target.value)}
            />
            {accessTokenErrorText !== "" && (
              <FieldError id="QoveryAuthorizePage-field-1-feedback">
                {accessTokenErrorText}
              </FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Connect to Qovery
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
