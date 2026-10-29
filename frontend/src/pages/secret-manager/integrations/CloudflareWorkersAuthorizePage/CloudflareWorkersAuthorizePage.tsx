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
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const CloudflareWorkersAuthorizePage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const [accessKey, setAccessKey] = useState("");
  const [accessKeyErrorText, setAccessKeyErrorText] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountIdErrorText, setAccountIdErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setAccessKeyErrorText("");
      setAccountIdErrorText("");
      if (accessKey.length === 0 || accountId.length === 0) {
        if (accessKey.length === 0) setAccessKeyErrorText("API token cannot be blank!");
        if (accountId.length === 0) setAccountIdErrorText("Account ID cannot be blank!");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "cloudflare-workers",
        accessId: accountId,
        accessToken: accessKey
      });

      setAccessKey("");
      setAccountId("");

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/cloudflare-workers/create",
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
      <PageTitle title="Authorize Cloudflare Workers Integration" />
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>Cloudflare Workers Integration</CardTitle>
          <CardDescription>
            After adding your API-key, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field data-invalid={accessKeyErrorText !== ""}>
            <FieldLabel htmlFor="cloudflareworkers-cloudflare-workers-api-token">
              Cloudflare Workers API token
            </FieldLabel>
            <Input
              placeholder=""
              value={accessKey}
              type="password"
              autoComplete="new-password"
              onChange={(e) => setAccessKey(e.target.value)}
              id="cloudflareworkers-cloudflare-workers-api-token"
              isError={accessKeyErrorText !== ""}
              aria-describedby={
                accessKeyErrorText !== ""
                  ? "cloudflareworkers-cloudflare-workers-api-token-error"
                  : undefined
              }
            />
            {accessKeyErrorText !== "" && (
              <FieldError id="cloudflareworkers-cloudflare-workers-api-token-error">
                {accessKeyErrorText}
              </FieldError>
            )}
          </Field>
          <Field data-invalid={accountIdErrorText !== ""}>
            <FieldLabel htmlFor="cloudflareworkers-cloudflare-workers-account-id">
              Cloudflare Workers Account ID
            </FieldLabel>
            <Input
              placeholder=""
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              id="cloudflareworkers-cloudflare-workers-account-id"
              isError={accountIdErrorText !== ""}
              aria-describedby={
                accountIdErrorText !== ""
                  ? "cloudflareworkers-cloudflare-workers-account-id-error"
                  : undefined
              }
            />
            {accountIdErrorText !== "" && (
              <FieldError id="cloudflareworkers-cloudflare-workers-account-id-error">
                {accountIdErrorText}
              </FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Connect to Cloudflare Workers
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
