import { useEffect, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faAngleDown, faArrowUpRightFromSquare, faBookOpen, faBugs, faCheckCircle, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import queryString from "query-string";

import {
  useCreateIntegration
} from "@app/hooks/api";

import {
  Button,
  Card,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormControl,
  Input,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "../../../components/v2";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

enum TabSections {
  Connection = "connection",
  Options = "options"
}

export default function GitHubCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isLoading: isIntegrationAuthAppsLoading } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [targetAppIds, setTargetAppIds] = useState<string[]>([]);
  const [secretSuffix, setSecretSuffix] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetAppIds([String(integrationAuthApps[0].appId)]);
      } else {
        setTargetAppIds(["none"]);
      }
    }
  }, [integrationAuthApps]);

  const handleButtonClick = async () => {
    try {
      setIsLoading(true);

      if (!integrationAuth?._id) return;

      const targetApps = integrationAuthApps?.filter(
        (integrationAuthApp) => targetAppIds.includes(String(integrationAuthApp.appId))
      );

      if (!targetApps) return;

      await Promise.all(
        targetApps.map(async (targetApp) => {
          await mutateAsync({
            integrationAuthId: integrationAuth?._id,
            isActive: true,
            app: targetApp.name,
            sourceEnvironment: selectedSourceEnvironment,
            owner: targetApp.owner,
            secretPath,
            metadata: {
              secretSuffix
            }
          })
        })
      );

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
    targetAppIds ? (
    <div className="flex flex-col h-full w-full items-center justify-center">
      <Head>
        <title>Set Up GitHub Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <CardTitle 
          className="text-left px-6 text-xl" 
          subTitle="Choose which environment in Infisical you want to sync to environment variables in GitHub."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center bg-mineshaft-200 rounded-full">
              <Image
                src="/images/integrations/GitHub.png"
                height={30}
                width={30}
                alt="GitHub logo"
              />
            </div>
            <span className="ml-2.5">GitHub Integration </span>
            <Link href="https://infisical.com/docs/integrations/cicd/githubactions" passHref>
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
        <Tabs defaultValue={TabSections.Connection} className="px-6">
          <TabList>
            <div className="flex flex-row border-b border-mineshaft-600 w-full">
              <Tab value={TabSections.Connection}>Connection</Tab>
              <Tab value={TabSections.Options}>Options</Tab>
            </div>
          </TabList>
          <TabPanel value={TabSections.Connection}>
            <motion.div
              key="panel-1"
              transition={{ duration: 0.15 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: 30 }}
            >
              <FormControl label="Project Environment">
                <Select
                  value={selectedSourceEnvironment}
                  onValueChange={(val) => setSelectedSourceEnvironment(val)}
                  className="w-full border border-mineshaft-500"
                >
                  {workspace?.environments.map((sourceEnvironment) => (
                    <SelectItem
                      value={sourceEnvironment.slug}
                      key={`azure-key-vault-environment-${sourceEnvironment.slug}`}
                    >
                      {sourceEnvironment.name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl label="Secrets Path">
                <Input
                  value={secretPath}
                  onChange={(evt) => setSecretPath(evt.target.value)}
                  placeholder="Provide a path, default is /"
                />
              </FormControl>
              <FormControl label="GitHub Repo">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    {(integrationAuthApps.length > 0) ? <div className="w-full cursor-pointer border border-mineshaft-600 inline-flex items-center justify-between rounded-md bg-mineshaft-900 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none data-[placeholder]:text-mineshaft-200">
                        {targetAppIds.length === 1 ? integrationAuthApps?.find(
                          (integrationAuthApp) => targetAppIds[0] === String(integrationAuthApp.appId)
                        )?.name : `${targetAppIds.length} repositories selected`}
                        <FontAwesomeIcon icon={faAngleDown} className="text-xs" />
                      </div> : <div className="w-full cursor-default border border-mineshaft-600 inline-flex items-center justify-between rounded-md bg-mineshaft-900 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none data-[placeholder]:text-mineshaft-200">
                        No repositories found
                      </div>}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="z-[100] max-h-80 overflow-y-scroll thin-scrollbar">
                    {(integrationAuthApps.length > 0) ? (
                      integrationAuthApps.map((integrationAuthApp) => {
                        const isSelected = targetAppIds.includes(String(integrationAuthApp.appId));

                        return (
                          <DropdownMenuItem
                            onClick={() => {
                              if (targetAppIds.includes(String(integrationAuthApp.appId))) {
                                setTargetAppIds(targetAppIds.filter((appId) => appId !== String(integrationAuthApp.appId)));
                              } else {
                                setTargetAppIds([...targetAppIds, String(integrationAuthApp.appId)]);
                              }
                            }}
                            key={integrationAuthApp.appId}
                            icon={isSelected ? <FontAwesomeIcon icon={faCheckCircle} className="text-primary pr-0.5" /> : <div className="pl-[1.01rem]"/>}
                            iconPos="left"
                            className="w-[28.4rem] text-sm"
                          >
                            {integrationAuthApp.name}
                          </DropdownMenuItem> 
                        )})
                    ) : <div/>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </FormControl>
            </motion.div>
          </TabPanel>
          <TabPanel value={TabSections.Options}>
            <motion.div
              key="panel-1"
              transition={{ duration: 0.15 }}
              initial={{ opacity: 0, translateX: -30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: 30 }}
            >
              <FormControl label="Append Secret Names with..." className="pb-[9.75rem]">
                <Input
                  value={secretSuffix}
                  onChange={(evt) => setSecretSuffix(evt.target.value)}
                  placeholder="Provide a suffix for secret names, default is no suffix"
                />
              </FormControl>
            </motion.div>
          </TabPanel>
        </Tabs>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mb-6 ml-auto mr-6"
          isLoading={isLoading}
          isDisabled={integrationAuthApps.length === 0 || targetAppIds.length === 0}
        >
          Create Integration
        </Button>
      </Card>
      <div className="border-t border-mineshaft-800 w-full max-w-md mt-6"/>
      <div className="flex flex-col bg-mineshaft-800 border border-mineshaft-600 w-full p-4 max-w-lg mt-6 rounded-md">
        <div className="flex flex-row items-center"><FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-200 text-xl"/> <span className="ml-3 text-md text-mineshaft-100">Pro Tips</span></div>
        <span className="text-mineshaft-300 text-sm mt-4">After creating an integration, your secrets will start syncing immediately. This might cause an unexpected override of current secrets in GitHub with secrets from Infisical.</span>
      </div>
    </div>
  ) : (
    <div className="flex justify-center items-center w-full h-full">
      <Head>
        <title>Set Up GitHub Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      {isIntegrationAuthAppsLoading ? <img src="/images/loading/loading.gif" height={70} width={120} alt="infisical loading indicator" /> : <div className="max-w-md h-max p-6 border border-mineshaft-600 rounded-md bg-mineshaft-800 text-mineshaft-200 flex flex-col text-center">
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

GitHubCreateIntegrationPage.requireAuth = true;
