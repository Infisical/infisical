import { useEffect, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import queryString from "query-string";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
import {
  useCreateIntegration
} from "@app/hooks/api";

import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthChecklyGroups
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

enum TabSections {
  Connection = "connection",
  Options = "options"
}

export default function ChecklyCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [secretSuffix, setSecretSuffix] = useState("");

  const [targetAppId, setTargetAppId] = useState("");
  const [targetGroupId, setTargetGroupId] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isLoading: isIntegrationAuthAppsLoading } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });
  const { data: integrationAuthGroups, isLoading: isintegrationAuthGroupsLoading } = useGetIntegrationAuthChecklyGroups({
    integrationAuthId: (integrationAuthId as string) ?? "",
    accountId: targetAppId
  });

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetAppId(integrationAuthApps[0].appId as string);
      } else {
        setTargetAppId("none");
      }
    }
  }, [integrationAuthApps]);

  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?._id) return;

      setIsLoading(true);

      const targetApp = integrationAuthApps?.find(
        (integrationAuthApp) => integrationAuthApp.appId === targetAppId
      );
      const targetGroup = integrationAuthGroups?.find(
        (group) => group.groupId === Number(targetGroupId)
      );
      
      if (!targetApp) return;
      
      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: targetApp?.name,
        appId: targetApp?.appId,
        sourceEnvironment: selectedSourceEnvironment,
        targetService: targetGroup?.name,
        targetServiceId: targetGroup?.groupId ? String(targetGroup?.groupId) : undefined,
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
    integrationAuthGroups &&
    targetAppId ? (
    <div className="flex h-full flex-col w-full py-6 items-center justify-center bg-gradient-to-tr from-mineshaft-900 to-bunker-900">
      <Head>
        <title>Set Up Checkly Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <CardTitle 
          className="text-left px-6 text-xl" 
          subTitle="Choose which environment in Infisical you want to sync to Checkly environment variables."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Checkly.png"
                height={30}
                width={30}
                alt="Checkly logo"
              />
            </div>
            <span className="ml-2.5">Checkly Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/checkly" passHref>
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
              <FormControl label="Infisical Project Environment">
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
              <FormControl label="Secrets Path">
                <Input
                  value={secretPath}
                  onChange={(evt) => setSecretPath(evt.target.value)}
                  placeholder="Provide a path, default is /"
                />
              </FormControl>
              <FormControl label="Checkly Account">
                <Select
                  value={targetAppId}
                  onValueChange={(val) => setTargetAppId(val)}
                  className="w-full border border-mineshaft-500"
                  isDisabled={integrationAuthApps.length === 0}
                >
                  {integrationAuthApps.length > 0 ? (
                    integrationAuthApps.map((integrationAuthApp) => (
                      <SelectItem
                        value={integrationAuthApp.appId as string}
                        key={`target-app-${integrationAuthApp.appId as string}`}
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
              <FormControl label="Checkly Group (Optional)">
                <Select
                  value={targetGroupId}
                  onValueChange={(val) => setTargetGroupId(val)}
                  className="w-full border border-mineshaft-500"
                >
                  {integrationAuthGroups.length > 0 ? (
                    integrationAuthGroups.map((integrationAuthGroup) => (
                      <SelectItem
                        value={String(integrationAuthGroup.groupId)}
                        key={`target-group-${String(integrationAuthGroup.groupId)}`}
                      >
                        {integrationAuthGroup.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" key="target-group-none">
                      No groups found
                    </SelectItem>
                  )}
                </Select>
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
        <title>Set Up Checkly Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      {isIntegrationAuthAppsLoading || isintegrationAuthGroupsLoading ? <img src="/images/loading/loading.gif" height={70} width={120} alt="infisical loading indicator" /> : <div className="max-w-md h-max p-6 border border-mineshaft-600 rounded-md bg-mineshaft-800 text-mineshaft-200 flex flex-col text-center">
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
