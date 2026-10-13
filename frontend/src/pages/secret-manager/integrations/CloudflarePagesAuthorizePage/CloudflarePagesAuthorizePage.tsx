import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const CloudflarePagesAuthorizePage = () => {
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
  const [accessKey, setAccessKey] = useState("");
  const [accessKeyErrorText, setAccessKeyErrorText] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountIdErrorText, setAccountIdErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { currentProject } = useProject();
  const navigate = useNavigate();

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
        integration: "cloudflare-pages",
        accessId: accountId,
        accessToken: accessKey
      });

      setAccessKey("");
      setAccountId("");
      setIsLoading(false);

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/cloudflare-pages/create",
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
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>Cloudflare Pages Integration</CardTitle>
          <CardDescription>
            After adding your API-key, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field data-invalid={accessKeyErrorText !== ""}>
            <FieldLabel htmlFor="cloudflarepages-cloudflare-pages-api-token">
              Cloudflare Pages API token
            </FieldLabel>
            <Input
              placeholder=""
              value={accessKey}
              type="password"
              autoComplete="new-password"
              onChange={(e) => setAccessKey(e.target.value)}
              id="cloudflarepages-cloudflare-pages-api-token"
              isError={accessKeyErrorText !== ""}
              aria-describedby={
                accessKeyErrorText !== ""
                  ? "cloudflarepages-cloudflare-pages-api-token-error"
                  : undefined
              }
            />
            {accessKeyErrorText !== "" && (
              <FieldError id="cloudflarepages-cloudflare-pages-api-token-error">
                {accessKeyErrorText}
              </FieldError>
            )}
          </Field>
          <Field data-invalid={accountIdErrorText !== ""}>
            <FieldLabel htmlFor="cloudflarepages-cloudflare-pages-account-id">
              Cloudflare Pages Account ID
            </FieldLabel>
            <Input
              placeholder=""
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              id="cloudflarepages-cloudflare-pages-account-id"
              isError={accountIdErrorText !== ""}
              aria-describedby={
                accountIdErrorText !== ""
                  ? "cloudflarepages-cloudflare-pages-account-id-error"
                  : undefined
              }
            />
            {accountIdErrorText !== "" && (
              <FieldError id="cloudflarepages-cloudflare-pages-account-id-error">
                {accountIdErrorText}
              </FieldError>
            )}
          </Field>
          <Button
            onClick={handleButtonClick}
            className="mt-2 mr-6 mb-6 ml-auto w-min"
            isPending={isLoading}
            variant="project"
          >
            Connect to Cloudflare Pages
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
