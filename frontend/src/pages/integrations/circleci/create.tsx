import { useEffect, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen, faBugs, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import queryString from "query-string";

import {
  useCreateIntegration
} from "@app/hooks/api";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "../../../components/v2";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

export default function CircleCICreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth, isLoading: isintegrationAuthLoading } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isLoading: isIntegrationAuthAppsLoading } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");

  const [targetApp, setTargetApp] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetApp(integrationAuthApps[0]?.name);
      } else {
        setTargetApp("none");
      }
    }
  }, [integrationAuthApps]);

  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?.id) return;

      setIsLoading(true);

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: targetApp,
        appId: integrationAuthApps?.find((integrationAuthApp) => integrationAuthApp.name === targetApp)?.appId,
        sourceEnvironment: selectedSourceEnvironment,
        secretPath
      });

      setIsLoading(false);

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    targetApp ? (
    <div className="flex flex-col h-full w-full items-center justify-center">
      <Head>
        <title>Set Up CircleCI Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle 
          className="text-left px-6 text-xl" 
          subTitle="Choose which environment or folder in Infisical you want to sync to CircleCI environment variables."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Circle CI.png"
                height={30}
                width={30}
                alt="CircleCI logo"
              />
            </div>
            <span className="ml-1.5">CircleCI Integration </span>
            <Link href="https://infisical.com/docs/integrations/cicd/circleci" passHref>
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
        <FormControl label="Project Environment" className="px-6">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {workspace?.environments.map((sourceEnvironment) => (
              <SelectItem
                value={sourceEnvironment.slug}
                key={`source-environment-${sourceEnvironment.slug}`}
              >
                {sourceEnvironment.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <FormControl label="Secrets Path" className="px-6">
          <Input
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </FormControl>
        <FormControl label="CircleCI Project" className="px-6">
          <Select
            value={targetApp}
            onValueChange={(val) => setTargetApp(val)}
            className="w-full border border-mineshaft-500"
            isDisabled={integrationAuthApps.length === 0}
          >
            {integrationAuthApps.length > 0 ? (
              integrationAuthApps.map((integrationAuthApp) => (
                <SelectItem
                  value={integrationAuthApp.name}
                  key={`target-app-${integrationAuthApp.name}`}
                >
                  {integrationAuthApp.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" key="target-app-none">
                No projects found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <Button
          onClick={handleButtonClick}
          colorSchema="primary"
          variant="outline_bg"
          className="mb-6 mt-2 ml-auto mr-6 w-min"
          isLoading={isLoading}
          isDisabled={integrationAuthApps.length === 0}
        >
          Create Integration
        </Button>
      </Card>
      <div className="border-t border-mineshaft-800 w-full max-w-md mt-6"/>
      <div className="flex flex-col bg-mineshaft-800 border border-mineshaft-600 w-full p-4 max-w-lg mt-6 rounded-md">
        <div className="flex flex-row items-center"><FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-200 text-xl"/> <span className="ml-3 text-md text-mineshaft-100">Pro Tips</span></div>
        <span className="text-mineshaft-300 text-sm mt-4">After creating an integration, your secrets will start syncing immediately. This might cause an unexpected override of current secrets in CircleCI with secrets from Infisical.</span>
      </div>
    </div>
  ) : (
    <div className="flex justify-center items-center w-full h-full">
      <Head>
        <title>Set Up CircleCI Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      {isIntegrationAuthAppsLoading || isintegrationAuthLoading ? <img src="/images/loading/loading.gif" height={70} width={120} alt="infisical loading indicator" /> : <div className="max-w-md h-max p-6 border border-mineshaft-600 rounded-md bg-mineshaft-800 text-mineshaft-200 flex flex-col text-center">
        <FontAwesomeIcon icon={faBugs} className="text-6xl my-2 inlineli"/>
        <p>
          Something went wrong. Please contact <a
            className="inline underline underline-offset-4 decoration-primary-500 opacity-80 hover:opacity-100 text-mineshaft-100 duration-200 cursor-pointer"
            target="_blank"
            rel="noopener noreferrer"
            href="mailto:support@infisical.com"
          >
            support@infisical.com
          </a> if the issue persists.
        </p>
      </div>}
    </div>
  );
}

CircleCICreateIntegrationPage.requireAuth = true;
