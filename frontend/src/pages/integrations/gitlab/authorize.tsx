import crypto from "crypto";

import { useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useGetCloudIntegrations } from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function GitLabAuthorizeIntegrationPage() {
    const { data: cloudIntegrations } = useGetCloudIntegrations();
  
    const [gitLabURL, setGitLabURL] = useState("");
  
    const handleIntegrateWithOAuth = () => {
      if (!cloudIntegrations) return;
      const integrationOption = cloudIntegrations.find((integration) => integration.slug === "gitlab");
      
      if (!integrationOption) return;
      
      const baseURL = gitLabURL.trim() === "" ? "https://gitlab.com" : gitLabURL.trim();
      
      const csrfToken = crypto.randomBytes(16).toString("hex");
      localStorage.setItem("latestCSRFToken", csrfToken);
      
      const state = `${csrfToken}|${gitLabURL.trim() === "" ? "" : gitLabURL.trim()}`;
      const link = `${baseURL}/oauth/authorize?client_id=${integrationOption.clientId}&redirect_uri=${window.location.origin}/integrations/gitlab/oauth2/callback&response_type=code&state=${state}`;
      
      window.location.assign(link);
    }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize GitLab Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 mb-12">
        <CardTitle 
          className="text-left px-6 text-xl" 
          subTitle="Authorize this integration to be able to sync secrets from Infisical to GitLab. If needed, specify the self-hosted GitLab URL."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Gitlab.png"
                height={28}
                width={28}
                alt="Gitlab logo"
              />
            </div>
            <span className="ml-2.5">GitLab Integration </span>
            <Link href="https://infisical.com/docs/integrations/cicd/gitlab" passHref>
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
        <FormControl label="Self-hosted URL (optional)" className="px-6">
            <Input 
                placeholder="https://self-hosted-gitlab.com" 
                value={gitLabURL} onChange={(e) => setGitLabURL(e.target.value)} 
            />
          </FormControl>
        <Button
            onClick={handleIntegrateWithOAuth}
            colorSchema="primary"
            variant="outline_bg"
            className="mb-6 mt-2 ml-auto mr-6 w-min"
        > 
            Continue with OAuth
        </Button>
      </Card>
    </div>
  );
}

GitLabAuthorizeIntegrationPage.requireAuth = true;
