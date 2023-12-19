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

export default function TerraformCloudCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [workspacesId, setWorkSpacesId] = useState("");
  const [workspacesIdErrorText, setWorkspacesIdErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setWorkspacesIdErrorText("");

      if (apiKey.length === 0) {
        setApiKeyErrorText("API Token cannot be blank");
        return;
      }
      
      if (workspacesId.length === 0) {
        setWorkspacesIdErrorText("Workspace Id cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "terraform-cloud",
        accessId: workspacesId,
        accessToken: apiKey
      });

      setIsLoading(false);

      router.push(`/integrations/terraform-cloud/create?integrationAuthId=${integrationAuth._id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize Terraform Cloud Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 mb-12">
        <CardTitle 
            className="text-left px-6 text-xl" 
            subTitle="After adding the details below, you will be prompted to set up an integration for a particular Infisical project and environment."
          >
            <div className="flex flex-row items-center">
              <div className="inline flex items-center pb-0.5">
                <Image
                  src="/images/integrations/Terraform cloud.png"
                  height={30}
                  width={30}
                  alt="Terraform Cloud logo"
                />
              </div>
              <span className="ml-1.5">Terraform Cloud Integration</span>
              <Link href="https://infisical.com/docs/integrations/cloud/terraform-cloud" passHref>
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
          label="Terraform Cloud API Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== "" ?? false}
          className="px-6"
        >
          <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </FormControl>
        <FormControl
          label="Terraform Cloud Workspace ID"
          errorText={workspacesIdErrorText}
          isError={workspacesIdErrorText !== "" ?? false}
          className="px-6"
        >
          <Input value={workspacesId} onChange={(e) => setWorkSpacesId(e.target.value)} />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          colorSchema="primary"
          variant="outline_bg"
          className="mb-6 mt-2 ml-auto mr-6 w-min"
          isLoading={isLoading}
        >
          Connect to Terraform Cloud
        </Button>
      </Card>
    </div>
  );
}

TerraformCloudCreateIntegrationPage.requireAuth = true;
