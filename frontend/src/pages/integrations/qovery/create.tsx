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
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthQoveryEnvironments,
  useGetIntegrationAuthQoveryOrgs,
  useGetIntegrationAuthQoveryProjects,
  useGetIntegrationAuthQoveryScopes
} from "@app/hooks/api/integrationAuth/queries";

import { useGetIntegrationAuthById } from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

const qoveryScopes = [
  { label: "Application", value: "application" },
  { label: "Container", value: "container" },
  { label: "Job", value: "job" }
];

enum TabSections {
  InfisicalSettings = "infisicalSettings",
  QoverySettings = "qoverySettings"
}

/**
 * Follow the logic:
 * - Access token
 * -> Get organizations (orgId) - select an organization
 * -> Get projects belonging to the organization - select project
 * -> Get environments belonging to the project - select environmnet
 * -> Get qovery scopes / application (this is the application to sync to)
 *
 * Do we even need to get organizations?
 */

export default function QoveryCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  const [scope, setScope] = useState("application");
  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");

  const { data: integrationAuthOrgs } = useGetIntegrationAuthQoveryOrgs(
    (integrationAuthId as string) ?? ""
  );
  const [targetOrgId, setTargetOrgId] = useState("");

  const { data: integrationAuthProjects } = useGetIntegrationAuthQoveryProjects({
    integrationAuthId: (integrationAuthId as string) ?? "",
    orgId: targetOrgId
  });
  const [targetProjectId, setTargetProjectId] = useState("");

  const { data: integrationAuthEnvironments } = useGetIntegrationAuthQoveryEnvironments({
    integrationAuthId: (integrationAuthId as string) ?? "",
    projectId: targetProjectId
  });
  const [targetEnvironmentId, setTargetEnvironmentId] = useState("");

  const { data: integrationAuthApps, isLoading: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthQoveryScopes({
      integrationAuthId: (integrationAuthId as string) ?? "",
      environmentId: targetEnvironmentId,
      scope: scope as "job" | "application" | "container"
    });
  const [targetAppId, setTargetAppId] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetAppId(String(integrationAuthApps[0].appId));
      } else {
        setTargetAppId("none");
      }
    }
  }, [integrationAuthApps]);

  useEffect(() => {
    if (integrationAuthOrgs) {
      if (integrationAuthOrgs.length > 0) {
        setTargetOrgId(String(integrationAuthOrgs[0].orgId));
      } else {
        setTargetOrgId("none");
      }
    }
  }, [integrationAuthOrgs]);

  useEffect(() => {
    if (integrationAuthProjects) {
      if (integrationAuthProjects.length > 0) {
        setTargetProjectId(String(integrationAuthProjects[0].projectId));
      } else {
        setTargetProjectId("none");
      }
    }
  }, [integrationAuthProjects]);

  useEffect(() => {
    if (integrationAuthEnvironments) {
      if (integrationAuthEnvironments.length > 0) {
        setTargetEnvironmentId(String(integrationAuthEnvironments[0].environmentId));
      } else {
        setTargetEnvironmentId("none");
      }
    }
  }, [integrationAuthEnvironments]);

  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?.id) return;

      setIsLoading(true);

      const targetOrg = integrationAuthOrgs?.find(
        (integrationAuthOrg) => integrationAuthOrg.orgId === targetOrgId
      )?.name;
      const targetProject = integrationAuthProjects?.find(
        (integrationAuthProject) => integrationAuthProject.projectId === targetProjectId
      )?.name;
      const targetEnvironment = integrationAuthEnvironments?.find(
        (integrationAuthEnvironment) =>
          integrationAuthEnvironment.environmentId === targetEnvironmentId
      )?.name;
      const targetApp = integrationAuthApps?.find(
        (integrationAuthApp) => integrationAuthApp.appId === targetAppId
      )?.name;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: targetApp,
        appId: targetAppId,
        scope,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment,
        targetEnvironmentId,
        targetService: targetProject,
        targetServiceId: targetProjectId,
        owner: targetOrg,
        secretPath
      });

      setIsLoading(false);

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth && workspace && selectedSourceEnvironment ? (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-tr from-mineshaft-900 to-bunker-900">
      <Head>
        <title>Set Up Qovery Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Choose which environment in Infisical you want to sync to Checkly environment variables."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Qovery.png"
                height={30}
                width={30}
                alt="Qovery logo"
              />
            </div>
            <span className="ml-2.5">Qovery Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/qovery" passHref>
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
        <Tabs defaultValue={TabSections.InfisicalSettings} className="px-6">
          <TabList>
            <div className="flex w-full flex-row border-b border-mineshaft-600">
              <Tab value={TabSections.InfisicalSettings}>Infisical Settings</Tab>
              <Tab value={TabSections.QoverySettings}>Qovery Settings</Tab>
            </div>
          </TabList>
          <TabPanel value={TabSections.InfisicalSettings}>
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
              <FormControl label="Secrets Path" className="pb-[14.68rem]">
                <Input
                  value={secretPath}
                  onChange={(evt) => setSecretPath(evt.target.value)}
                  placeholder="Provide a path, default is /"
                />
              </FormControl>
            </motion.div>
          </TabPanel>
          <TabPanel value={TabSections.QoverySettings}>
            <motion.div
              key="panel-1"
              transition={{ duration: 0.15 }}
              initial={{ opacity: 0, translateX: -30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: 30 }}
            >
              <FormControl label="Qovery Scope">
                <Select
                  value={scope}
                  onValueChange={(val) => setScope(val)}
                  className="w-full border border-mineshaft-500"
                >
                  {qoveryScopes.map((qoveryScope) => (
                    <SelectItem value={qoveryScope.value} key={`target-app-${qoveryScope.value}`}>
                      {qoveryScope.label}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
              {integrationAuthOrgs && (
                <FormControl label="Qovery Organization">
                  <Select
                    value={targetOrgId}
                    onValueChange={(val) => setTargetOrgId(val)}
                    className="w-full border border-mineshaft-500"
                    isDisabled={integrationAuthOrgs.length === 0}
                  >
                    {integrationAuthOrgs.length > 0 ? (
                      integrationAuthOrgs.map((integrationAuthOrg) => (
                        <SelectItem
                          value={integrationAuthOrg.orgId}
                          key={`target-app-${integrationAuthOrg.orgId}`}
                        >
                          {integrationAuthOrg.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" key="target-app-none">
                        No organizaztions found
                      </SelectItem>
                    )}
                  </Select>
                </FormControl>
              )}
              {integrationAuthProjects && (
                <FormControl label="Qovery Project">
                  <Select
                    value={targetProjectId}
                    onValueChange={(val) => setTargetProjectId(val)}
                    className="w-full border border-mineshaft-500"
                    isDisabled={integrationAuthProjects.length === 0}
                  >
                    {integrationAuthProjects.length > 0 ? (
                      integrationAuthProjects.map((integrationAuthProject) => (
                        <SelectItem
                          value={integrationAuthProject.projectId}
                          key={`target-app-${integrationAuthProject.projectId}`}
                        >
                          {integrationAuthProject.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" key="target-app-none">
                        No projects found
                      </SelectItem>
                    )}
                  </Select>
                </FormControl>
              )}
              {integrationAuthEnvironments && (
                <FormControl label="Qovery Environment">
                  <Select
                    value={targetEnvironmentId}
                    onValueChange={(val) => setTargetEnvironmentId(val)}
                    className="w-full border border-mineshaft-500"
                    isDisabled={integrationAuthEnvironments.length === 0}
                  >
                    {integrationAuthEnvironments.length > 0 ? (
                      integrationAuthEnvironments.map((integrationAuthEnvironment) => (
                        <SelectItem
                          value={integrationAuthEnvironment.environmentId}
                          key={`target-app-${integrationAuthEnvironment.environmentId}`}
                        >
                          {integrationAuthEnvironment.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" key="target-app-none">
                        No environments found
                      </SelectItem>
                    )}
                  </Select>
                </FormControl>
              )}
              {scope && integrationAuthApps && (
                <FormControl label={`Qovery ${scope.charAt(0).toUpperCase() + scope.slice(1)}`}>
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
                          key={`target-app-${integrationAuthApp.appId}`}
                        >
                          {integrationAuthApp.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" key="target-app-none">
                        No {scope}s found
                      </SelectItem>
                    )}
                  </Select>
                </FormControl>
              )}
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
      {/* <div className="border-t border-mineshaft-800 w-full max-w-md mt-6"/>
      <div className="flex flex-col bg-mineshaft-800 border border-mineshaft-600 w-full p-4 max-w-lg mt-6 rounded-md">
        <div className="flex flex-row items-center"><FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-200 text-xl"/> <span className="ml-3 text-md text-mineshaft-100">Pro Tip</span></div>
        <span className="text-mineshaft-300 text-sm mt-4">After creating an integration, your secrets will start syncing immediately. This might cause an unexpected override of current secrets in Qovery with secrets from Infisical.</span>
      </div> */}
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Set Up Qovery Integration</title>
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

QoveryCreateIntegrationPage.requireAuth = true;
