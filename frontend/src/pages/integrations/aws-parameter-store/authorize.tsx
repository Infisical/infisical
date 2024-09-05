import { useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useSaveIntegrationAccessToken } from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function AWSParameterStoreAuthorizeIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const [isLoading, setIsLoading] = useState(false);

  const [accessKey, setAccessKey] = useState("");
  const [accessKeyErrorText, setAccessKeyErrorText] = useState("");
  const [accessSecretKey, setAccessSecretKey] = useState("");
  const [accessSecretKeyErrorText, setAccessSecretKeyErrorText] = useState("");

  const handleButtonClick = async () => {
    try {
      setAccessKeyErrorText("");
      setAccessSecretKeyErrorText("");

      if (accessKey.length === 0) {
        setAccessKeyErrorText("Access key cannot be blank");
        return;
      }

      if (accessSecretKey.length === 0) {
        setAccessSecretKeyErrorText("Secret access key cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "aws-parameter-store",
        accessId: accessKey,
        accessToken: accessSecretKey
      });

      setAccessKey("");
      setAccessSecretKey("");
      setIsLoading(false);

      router.push(
        `/integrations/aws-parameter-store/create?integrationAuthId=${integrationAuth.id}`
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize AWS Parameter Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After adding the details below, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <Image
                src="/images/integrations/Amazon Web Services.png"
                height={35}
                width={35}
                alt="AWS logo"
              />
            </div>
            <span className="ml-1.5">AWS Parameter Store Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/aws-parameter-store" passHref>
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
          label="Access Key ID"
          errorText={accessKeyErrorText}
          isError={accessKeyErrorText !== "" ?? false}
          className="px-6"
        >
          <Input placeholder="" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} />
        </FormControl>
        <FormControl
          label="Secret Access Key"
          errorText={accessSecretKeyErrorText}
          isError={accessSecretKeyErrorText !== "" ?? false}
          className="px-6"
        >
          <Input
            placeholder=""
            value={accessSecretKey}
            type="password"
            autoComplete="new-password"
            onChange={(e) => setAccessSecretKey(e.target.value)}
          />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          colorSchema="primary"
          variant="outline_bg"
          className="mb-6 mt-2 ml-auto mr-6 w-min"
          isLoading={isLoading}
        >
          Connect to AWS Parameter Store
        </Button>
      </Card>
    </div>
  );
}

AWSParameterStoreAuthorizeIntegrationPage.requireAuth = true;
