import { useState } from "react";
import { Helmet } from "react-helmet";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const TeamcityAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const { currentWorkspace } = useWorkspace();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [serverUrlErrorText, setServerUrlErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setServerUrlErrorText("");

      if (apiKey.length === 0) {
        setApiKeyErrorText("Access Token cannot be blank");
        return;
      }

      if (serverUrl.length === 0) {
        setServerUrlErrorText("Server URL cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentWorkspace.id,
        integration: "teamcity",
        accessToken: apiKey,
        url: serverUrl
      });

      setIsLoading(false);

      navigate({
        to: "/projects/$projectId/secret-manager/integrations/teamcity/create",
        params: {
          projectId: currentWorkspace.id
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
      <Helmet>
        <title>Authorize TeamCity Integration</title>
      </Helmet>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After adding the details below, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <img
                src="/images/integrations/TeamCity.png"
                height={28}
                width={28}
                alt="TeamCity logo"
              />
            </div>
            <span className="ml-2">TeamCity Integration</span>
            <a
              target="_blank"
              href="https://infisical.com/docs/integrations/cloud/teamcity"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.07rem] ml-1.5 text-xxs"
                />
              </div>
            </a>
          </div>
        </CardTitle>
        <FormControl
          label="TeamCity Access Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== ""}
          className="px-6"
        >
          <Input
            placeholder="Access Token"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </FormControl>
        <FormControl
          label="TeamCity Server URL"
          errorText={serverUrlErrorText}
          isError={serverUrlErrorText !== ""}
          className="px-6"
        >
          <Input
            placeholder="https://example.teamcity.com"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
          />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          colorSchema="primary"
          variant="outline_bg"
          className="mb-6 ml-auto mr-6 mt-2 w-min"
          isLoading={isLoading}
        >
          Connect to TeamCity
        </Button>
      </Card>
    </div>
  );
};
