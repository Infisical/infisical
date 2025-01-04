import { useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useSaveIntegrationAccessToken } from "@app/hooks/api";

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
        accessToken
      });

      setIsLoading(false);

      router.push(`/integrations/checkly/create?integrationAuthId=${integrationAuth.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize Checkly Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After adding your API key, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Checkly.png"
                height={30}
                width={30}
                alt="Checkly logo"
              />
            </div>
            <span className="ml-2.5">Checkly Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/checkly" passHref>
              <a target="_blank" rel="noopener noreferrer">
                <div className="ml-2 mb-1 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="ml-1.5 mb-[0.07rem] text-xxs"
                  />
                </div>
              </a>
            </Link>
          </div>
        </CardTitle>
        <FormControl
          label="Checkly API key"
          errorText={accessTokenErrorText}
          isError={accessTokenErrorText !== "" ?? false}
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
