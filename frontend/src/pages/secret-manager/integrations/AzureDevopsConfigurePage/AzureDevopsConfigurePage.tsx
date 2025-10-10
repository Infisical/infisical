import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "@app/hooks/api/integrationAuth";
import { useGetWorkspaceById } from "@app/hooks/api/projects";
import { IntegrationsListPageTabs } from "@app/types/integrations";

export const AzureDevopsConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.AzureDevopsConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { currentProject } = useProject();

  const { data: workspace } = useGetWorkspaceById(currentProject.id);
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? "",
    azureDevOpsOrgName: localStorage.getItem("azure-devops-org-name") ?? ""
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
        setTargetApp(integrationAuthApps[0].name);
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
        app: localStorage.getItem("azure-devops-org-name") || "",
        appId: targetApp,
        sourceEnvironment: selectedSourceEnvironment,
        secretPath
      });

      setIsLoading(false);

      navigate({
        to: "/projects/secret-management/$projectId/integrations",
        params: {
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
    targetApp ? (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Set Up Azure DevOps Integration</title>
      </Helmet>
      <Card className="border-mineshaft-600 max-w-lg rounded-md border">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Choose which environment in Infisical you want to sync to secrets in Azure DevOps."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <img
                src="/images/integrations/Microsoft Azure.png"
                height={35}
                width={35}
                alt="Azure DevOps logo"
              />
            </div>
            <span className="ml-1.5">Azure DevOps Integration </span>
            <a
              href="https://infisical.com/docs/integrations/cloud/azure-devops"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="bg-yellow/20 text-yellow mb-1 ml-2 inline-block cursor-default rounded-md px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm opacity-80 hover:opacity-100">
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
        <FormControl label="Project Environment" className="mt-4 px-6">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="border-mineshaft-500 w-full border"
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
        <FormControl className="px-6" label="Secrets Path">
          <Input
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </FormControl>
        <FormControl label="Azure DevOps Project" className="px-6">
          <Select
            value={targetApp}
            onValueChange={(val) => setTargetApp(val)}
            className="border-mineshaft-500 w-full border"
            isDisabled={integrationAuthApps.length === 0}
          >
            {integrationAuthApps.length > 0 ? (
              integrationAuthApps.map((integrationAuthApp) => (
                <SelectItem
                  value={integrationAuthApp.name}
                  key={`target-environment-${integrationAuthApp.name}`}
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
          className="mb-6 ml-auto mr-6 mt-2 w-min"
          isLoading={isLoading}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div />
  );
};
