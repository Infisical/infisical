import { useState } from "react";
import { Helmet } from "react-helmet";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const QoveryAuthorizePage = () => {
  const navigate = useNavigate();
  const { currentProject } = useProject();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
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
        workspaceId: currentProject.id,
        integration: "qovery",
        accessToken
      });

      setIsLoading(false);

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
      <Helmet>
        <title>Authorize Qovery Integration</title>
      </Helmet>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After adding your API key, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <img src="/images/integrations/Qovery.png" height={30} width={30} alt="Qovery logo" />
            </div>
            <span className="ml-2.5">Qovery Integration </span>
            <a
              href="https://infisical.com/docs/integrations/cloud/qovery"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="text-xxs mb-[0.07rem] ml-1.5"
                />
              </div>
            </a>
          </div>
        </CardTitle>
        <FormControl
          label="Qovery API token"
          errorText={accessTokenErrorText}
          isError={accessTokenErrorText !== ""}
          className="mx-6"
        >
          <Input
            placeholder=""
            value={accessToken}
            type="password"
            autoComplete="new-password"
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          colorSchema="primary"
          variant="outline_bg"
          className="mt-2 mr-6 mb-6 ml-auto w-min"
          isFullWidth={false}
          isLoading={isLoading}
        >
          Connect to Qovery
        </Button>
      </Card>
    </div>
  );
};
