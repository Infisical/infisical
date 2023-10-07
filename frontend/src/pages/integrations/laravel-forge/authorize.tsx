import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  useSaveIntegrationAccessToken
} from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function LaravelForgeCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [serverId, setServerId] = useState("");
  const [serverIdErrorText, setServerIdErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setServerIdErrorText("");

      if (apiKey.length === 0) {
        setApiKeyErrorText("Access Token cannot be blank");
        return;
      }
      
      if (serverId.length === 0) {
        setServerIdErrorText("Server Id cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "laravel-forge",
        accessId: serverId,
        accessToken: apiKey
      });

      setIsLoading(false);

      router.push(`/integrations/laravel-forge/create?integrationAuthId=${integrationAuth._id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Laravel Forge Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 mb-12">
      <CardTitle 
          className="text-left px-6 text-xl" 
          subTitle="After adding your Access Token and Server ID, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Laravel forge.png"
                height={15}
                width={30}
                alt="Laravel Forge logo"
              />
            </div>
            <span className="ml-1.5">Laravel Forge Integration</span>
            <Link href="https://infisical.com/docs/integrations/cloud/laravel-forge" passHref>
              <a target="_blank" rel="noopener noreferrer">
                <div className="ml-2 mb-1 rounded-md text-yellow text-sm inline-block bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] opacity-80 hover:opacity-100 cursor-default">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5"/> 
                  Docs
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="ml-1.5 text-xxs mb-[0.07rem]"/> 
                </div>
              </a>
            </Link>
          </div>
        </CardTitle>
        <FormControl
          label="Laravel Forge Access Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== "" ?? false}
          className="px-6"
        >
          <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </FormControl>
        <FormControl
          label="Laravel Forge Server ID"
          errorText={serverIdErrorText}
          isError={serverIdErrorText !== "" ?? false}
          className="px-6"
        >
          <Input value={serverId} onChange={(e) => setServerId(e.target.value)} />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          colorSchema="primary"
          variant="outline_bg"
          className="mb-6 mt-2 ml-auto mr-6 w-min"
          isLoading={isLoading}
        >
          Connect to Laravel Forge
        </Button>
      </Card>
    </div>
  );
}

LaravelForgeCreateIntegrationPage.requireAuth = true;
