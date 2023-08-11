import { useState } from "react";
import { useRouter } from "next/router";

import {
  useSaveIntegrationAccessToken
} from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function ChecklyCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const [accessToken, setAccessToken] = useState("");
  const [accessTokenErrorText, setAccessTokenErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setAccessTokenErrorText("");
      if (accessToken.length === 0) {
        setAccessTokenErrorText("Access token cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "checkly",
        accessId: null,
        accessToken,
        url: null,
        namespace: null
      });

      setIsLoading(false);

      router.push(`/integrations/checkly/create?integrationAuthId=${integrationAuth._id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-lg rounded-md border border-mineshaft-600 mb-12">
        <CardTitle className="text-left px-6" subTitle="After adding your API-key, you will be prompted to set up an integration for a particular Infisical project and environment.">Checkly Integration</CardTitle>
        <FormControl
          label="Checkly API key"
          errorText={accessTokenErrorText}
          isError={accessTokenErrorText !== "" ?? false}
          className="mx-6"
        >
          <Input
            placeholder=""
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mb-6 mt-2 ml-auto mr-6 w-min"
          isFullWidth={false}
          isLoading={isLoading}
        >
          Connect to Checkly
        </Button>
      </Card>
    </div>
  );
}

ChecklyCreateIntegrationPage.requireAuth = true;
