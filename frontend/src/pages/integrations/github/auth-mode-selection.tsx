import crypto from "crypto";

import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, Card, CardTitle } from "@app/components/v2";
import { useGetCloudIntegrations } from "@app/hooks/api";

export default function GithubIntegrationAuthModeSelectionPage() {
  const router = useRouter();
  const { data: cloudIntegrations } = useGetCloudIntegrations();
  const githubIntegration = cloudIntegrations?.find((integration) => integration.slug === "github");

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Select Github Integration Auth</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Select how you'd like to integrate with GitHub. For more precise control, we recommend using the GitHub App method."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <Image
                src="/images/integrations/GitHub.png"
                height={30}
                width={30}
                alt="Github logo"
              />
            </div>
            <span className="ml-2.5">Github Integration </span>
            <Link href="https://infisical.com/docs/integrations/cicd/githubactions" passHref>
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
        <div className="mb-7 flex flex-col items-center">
          <Button
            colorSchema="primary"
            variant="outline_bg"
            className="mt-2 w-3/4"
            size="sm"
            type="submit"
            onClick={() => {
              router.push("/integrations/select-integration-auth?integrationSlug=github");
            }}
          >
            Connect with Github App
          </Button>
          <Button
            colorSchema="primary"
            variant="outline_bg"
            className="mt-3 w-3/4"
            size="sm"
            type="submit"
            onClick={() => {
              const state = crypto.randomBytes(16).toString("hex");
              localStorage.setItem("latestCSRFToken", state);

              window.location.assign(
                `https://github.com/login/oauth/authorize?client_id=${githubIntegration?.clientId}&response_type=code&scope=repo,admin:org&redirect_uri=${window.location.origin}/integrations/github/oauth2/callback&state=${state}`
              );
            }}
          >
            Connect with Github OAuth
          </Button>
        </div>
      </Card>
    </div>
  );
}

GithubIntegrationAuthModeSelectionPage.requireAuth = true;
