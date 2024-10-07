import { useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useSaveIntegrationAccessToken } from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function DatabricksCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync, isLoading } = useSaveIntegrationAccessToken();

  const [apiKey, setApiKey] = useState("");
  const [instanceURL, setInstanceURL] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [instanceURLErrorText, setInstanceURLErrorText] = useState("");

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setInstanceURLErrorText("");
      if (apiKey.length === 0) {
        setApiKeyErrorText("API Key cannot be blank");
        return;
      }
      if (instanceURL.length === 0) {
        setInstanceURLErrorText("Instance URL cannot be blank");
        return;
      }

      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "databricks",
        url: instanceURL.replace(/\/$/, ""),
        accessToken: apiKey
      });

      router.push(`/integrations/databricks/create?integrationAuthId=${integrationAuth.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize Databricks Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After adding your Access Token, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Databricks.png"
                height={30}
                width={30}
                alt="Databricks logo"
              />
            </div>
            <span className="ml-1.5">Databricks Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/databricks" passHref>
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
          label="Databricks Instance URL"
          errorText={instanceURLErrorText}
          isError={instanceURLErrorText !== "" ?? false}
          className="px-6"
        >
          <Input value={instanceURL} onChange={(e) => setInstanceURL(e.target.value)} placeholder="https://xxxx.cloud.databricks.com" />
        </FormControl>
        <FormControl
          label="Access Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== "" ?? false}
          className="px-6"
        >
          <Input placeholder="" value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          colorSchema="primary"
          variant="outline_bg"
          className="mb-6 mt-2 ml-auto mr-6 w-min"
          isLoading={isLoading}
          isDisabled={isLoading}
        >
          Connect to Databricks
        </Button>
      </Card>
    </div>
  );
}

DatabricksCreateIntegrationPage.requireAuth = true;
