import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import queryString from "query-string";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
import {
  useCreateIntegration
} from "@app/hooks/api";

import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

export default function ChecklyCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isLoading: isintegrationAuthAppsLoading } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [secretSuffix, setSecretSuffix] = useState("");

  const [targetApp, setTargetApp] = useState("");
  const [targetAppId, setTargetAppId] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    // TODO: handle case where apps can be empty
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetApp(integrationAuthApps[0].name);
        setTargetAppId(String(integrationAuthApps[0].appId));
      } else {
        setTargetApp("none");
      }
    }
  }, [integrationAuthApps]);

  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?._id) return;

      setIsLoading(true);

      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: targetApp,
        appId: targetAppId,
        sourceEnvironment: selectedSourceEnvironment,
        secretPath,
        metadata: {
          secretSuffix
        }
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
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-mineshaft-900 to-bunker-900">
      <Head>
        <title>Set Up Checkly Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <CardTitle 
          className="text-left px-6 text-xl" 
          subTitle="Choose which environment in Infisical you want to sync with your Checkly account."
        >
          Checkly Integration 
          <Link href="https://infisical.com/docs/integrations/cloud/checkly" passHref>
            <a target="_blank" rel="noopener noreferrer">
              <div className="ml-2 mb-1 rounded-md text-yellow text-sm inline-block bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] opacity-80 hover:opacity-100 cursor-default">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5"/> 
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="ml-1.5 text-xxs mb-[0.07rem]"/> 
              </div>
            </a>
          </Link>
        </CardTitle>
        <FormControl label="Infisical Project Environment" className="mt-4 px-6">
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
        <FormControl label="Secrets Path" className="mt-4 px-6">
          <Input
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </FormControl>
        <FormControl label="Checkly Account" className="mt-4 px-6">
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
                No apps found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <FormControl label="Append the Secret Name with..." className="mt-4 px-6">
          <Input
            value={secretSuffix}
            onChange={(evt) => setSecretSuffix(evt.target.value)}
            placeholder="Provide a suffix for secret names, default is no suffix"
          />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mt-2 mb-6 ml-auto mr-6"
          isFullWidth={false}
          isLoading={isLoading}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div className="flex justify-center items-center w-full h-full">
      <Head>
        <title>Set Up GCP Secret Manager Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      {isintegrationAuthAppsLoading ? <img src="/images/loading/loading.gif" height={70} width={120} alt="infisical loading indicator" /> : <div className="max-w-md h-max p-6 border border-mineshaft-600 rounded-md bg-mineshaft-800 text-mineshaft-200 flex flex-col text-center">
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

ChecklyCreateIntegrationPage.requireAuth = true;
