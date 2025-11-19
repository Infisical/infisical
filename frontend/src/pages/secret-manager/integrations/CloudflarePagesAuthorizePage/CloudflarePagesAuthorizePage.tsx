import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
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
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left"
          subTitle="After adding your API-key, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          Cloudflare Pages Integration
        </CardTitle>
        <FormControl
          label="Cloudflare Pages API token"
          errorText={accessKeyErrorText}
          isError={accessKeyErrorText !== ""}
          className="mx-6"
        >
          <Input
            placeholder=""
            value={accessKey}
            type="password"
            autoComplete="new-password"
            onChange={(e) => setAccessKey(e.target.value)}
          />
        </FormControl>
        <FormControl
          label="Cloudflare Pages Account ID"
          errorText={accountIdErrorText}
          isError={accountIdErrorText !== ""}
          className="mx-6"
        >
          <Input placeholder="" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mt-2 mr-6 mb-6 ml-auto w-min"
          isFullWidth={false}
          isLoading={isLoading}
        >
          Connect to Cloudflare Pages
        </Button>
      </Card>
    </div>
  );
};
