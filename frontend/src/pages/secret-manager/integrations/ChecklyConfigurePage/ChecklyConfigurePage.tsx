import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "framer-motion";

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
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthChecklyGroups
} from "@app/hooks/api/integrationAuth";
import { useGetWorkspaceById } from "@app/hooks/api/projects";
import { IntegrationsListPageTabs } from "@app/types/integrations";

enum TabSections {
  Connection = "connection",
  Options = "options"
}

export const ChecklyConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.ChecklyConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { currentProject } = useProject();

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [secretSuffix, setSecretSuffix] = useState("");

  const [targetAppId, setTargetAppId] = useState("");
  const [targetGroupId, setTargetGroupId] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  const { data: workspace } = useGetWorkspaceById(currentProject.id);
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });
  const { data: integrationAuthGroups, isPending: isintegrationAuthGroupsLoading } =
    useGetIntegrationAuthChecklyGroups({
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
      if (!integrationAuth?.id) return;

      setIsLoading(true);

      const targetApp = integrationAuthApps?.find(
        (integrationAuthApp) => integrationAuthApp.appId === targetAppId
      );
      const targetGroup = integrationAuthGroups?.find(
        (group) => group.groupId === Number(targetGroupId)
      );

      if (!targetApp) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
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

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search: {
          selectedTab: IntegrationsListPageTabs.NativeIntegrations
        }
      });
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
    <div className="flex h-full w-full flex-col items-center justify-center bg-linear-to-tr from-mineshaft-900 to-bunker-900 py-6">
      <Helmet>
        <title>Set Up Checkly Integration</title>
      </Helmet>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Choose which environment in Infisical you want to sync to Checkly environment variables."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <img
                src="/images/integrations/Checkly.png"
                height={30}
                width={30}
                alt="Checkly logo"
              />
            </div>
            <span className="ml-2.5">Checkly Integration </span>
            <a
              href="https://infisical.com/docs/integrations/cloud/checkly"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="text-xxs mb-[0.07rem] ml-1.5"
                />
              </div>
            </a>
          </div>
        </CardTitle>
        <Tabs defaultValue={TabSections.Connection} className="px-6">
          <TabList>
            <div className="flex w-full flex-row border-b border-mineshaft-600">
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
              <FormControl label="Append Secret Names with..." className="pb-39">
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
          className="mr-6 mb-6 ml-auto"
          isFullWidth={false}
          isLoading={isLoading}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Set Up Checkly Integration</title>
      </Helmet>
      {isIntegrationAuthAppsLoading || isintegrationAuthGroupsLoading ? (
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
};
