import { useEffect, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen, faBugs, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import queryString from "query-string";

import { RadioGroup } from "@app/components/v2/RadioGroup";
import { useCreateIntegration } from "@app/hooks/api";
import { useGetIntegrationAuthHerokuPipelines } from "@app/hooks/api/integrationAuth/queries";
import { App, Pipeline } from "@app/hooks/api/integrationAuth/types";

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
import { useCreateWsEnvironment, useGetWorkspaceById } from "../../../hooks/api/workspace";

export default function HerokuCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();
  const { mutateAsync: mutateAsyncEnv } = useCreateWsEnvironment();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isLoading: isIntegrationAuthAppsLoading  } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const { data: integrationAuthPipelineCouplings } = useGetIntegrationAuthHerokuPipelines({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [uniquePipelines, setUniquePipelines] = useState<Pipeline[]>();
  const [selectedPipeline, setSelectedPipeline] = useState("");
  const [selectedPipelineApps, setSelectedPipelineApps] = useState<App[]>();
  const [targetApp, setTargetApp] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [integrationType, setIntegrationType] = useState("App");

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthPipelineCouplings) {
        const uniquePipelinesConst = Array.from(
          new Set(
            integrationAuthPipelineCouplings
              .map(({ pipeline: { pipelineId, name } }) => ({
                name,
                pipelineId
              }))
              .map((obj) => JSON.stringify(obj))
          )).map((str) => JSON.parse(str)) as { pipelineId: string; name: string }[]
        setUniquePipelines(uniquePipelinesConst);
        if (uniquePipelinesConst) {
          if (uniquePipelinesConst!.length > 0) {
            setSelectedPipeline(uniquePipelinesConst![0].name);
          } else {
            setSelectedPipeline("none");
          }
        }
    }
  }, [integrationAuthPipelineCouplings]);

  useEffect(() => {
    if (integrationAuthPipelineCouplings) {
      setSelectedPipelineApps(integrationAuthApps?.filter(app => integrationAuthPipelineCouplings
        .filter((pipelineCoupling) => pipelineCoupling.pipeline.name === selectedPipeline)
        .map(coupling => coupling.app.appId).includes(String(app.appId))))
    }
  }, [selectedPipeline]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetApp(integrationAuthApps[0].name);
      } else {
        setTargetApp("none");
      }
    }
  }, [integrationAuthApps]);

  const handleButtonClick = async () => {
    try {
      setIsLoading(true);

      if (!integrationAuth?.id) return;

      if (integrationType === "App") {
        await mutateAsync({
          integrationAuthId: integrationAuth?.id,
          isActive: true,
          app: targetApp,
          sourceEnvironment: selectedSourceEnvironment,
          secretPath
        });
      } else if (integrationType === "Pipeline") {
        selectedPipelineApps?.map(async (app, index) => {
          setTimeout(async () => {
            await mutateAsyncEnv({
              workspaceId: String(localStorage.getItem("projectData.id")),
              name: app.name,
              slug: app.name.toLowerCase().replaceAll(" ", "-")
            });
            await mutateAsync({
              integrationAuthId: integrationAuth?.id,
              isActive: true,
              app: app.name,
              sourceEnvironment: app.name.toLowerCase().replaceAll(" ", "-"),
              secretPath
            })
          }, 1000*index)
        })
      }

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
        <title>Set Up Heroku Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Select which environment or folder in Infisical you want to sync to Heroku's environment variables."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <Image
                src="/images/integrations/Heroku.png"
                height={30}
                width={30}
                alt="Heroku logo"
              />
            </div>
            <span className="ml-2">Heroku Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/heroku" passHref>
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
        <RadioGroup 
          value={integrationType} 
          onValueChange={(val) => setIntegrationType(val)}
        />
        {integrationType === "Pipeline" && <>
        <FormControl label="Heroku Pipeline" className="px-6">
          <Select
            value={selectedPipeline}
            onValueChange={(val) => setSelectedPipeline(val)}
            className="w-full border border-mineshaft-500"
          >
            {uniquePipelines?.map((pipeline) => (
              <SelectItem
                value={pipeline.name}
                key={`source-environment-${pipeline.name}`}
              >
                {pipeline.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <div className="px-6 text-sm mb-4 inline-block text-bunker-300">
          After creating the integration, the following Heroku apps will be automatically synced to Infisical: 
          <div className="flex flex-col">
            {selectedPipelineApps?.map(app => <p key={app.name} className="text-bunker-200 pl-0.5 inline-flex"><span className="text-primary pr-1">-&gt;</span> {app.name}</p>)}
          </div>
          From then on, every new app in the selected pipeline will be synced to Infisical, too. 
        </div>
        </>}
        {integrationType === "App" && <>
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
        <FormControl label="Heroku App" className="px-6">
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
        </FormControl></>}
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mt-2 mb-6 ml-auto mr-6"
          isLoading={isLoading}
          isDisabled={integrationAuthApps.length === 0}
        >
          Create Integration
        </Button>
      </Card>
      {integrationType === "App" && <>
      <div className="mt-6 w-full max-w-md border-t border-mineshaft-800" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-mineshaft-200" />{" "}
          <span className="text-md ml-3 text-mineshaft-100">Pro Tips</span>
        </div>
        <span className="mt-4 text-sm text-mineshaft-300">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in Heroku with secrets from Infisical.
        </span>
      </div></>}
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Set Up Vercel Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      {isIntegrationAuthAppsLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 text-center text-mineshaft-200">
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-mineshaft-100 underline decoration-primary-500 underline-offset-4 opacity-80 duration-200 hover:opacity-100"
              target="_blank"
              rel="noopener noreferrer"
              href="mailto:support@infisical.com"
            >
              support@infisical.com
            </a>{" "}
            if the issue persists.
          </p>
        </div>
      )}
    </div>
  );
}

HerokuCreateIntegrationPage.requireAuth = true;
