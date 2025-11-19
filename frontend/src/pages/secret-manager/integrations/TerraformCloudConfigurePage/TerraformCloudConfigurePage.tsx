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
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "@app/hooks/api/integrationAuth";
import { IntegrationSyncBehavior } from "@app/hooks/api/integrations/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const initialSyncBehaviors = [
  {
    label: "No Import - Overwrite all values in Terraform Cloud",
    value: IntegrationSyncBehavior.OVERWRITE_TARGET
  },
  {
    label: "Import non-sensitive - Prefer values from Terraform Cloud",
    value: IntegrationSyncBehavior.PREFER_TARGET
  },
  {
    label: "Import non-sensitive - Prefer values from Infisical",
    value: IntegrationSyncBehavior.PREFER_SOURCE
  }
];

const variableTypes = [{ name: "env" }, { name: "terraform" }];

export const TerraformCloudConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.TerraformCloudConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
  const [targetApp, setTargetApp] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [variableType, setVariableType] = useState(variableTypes[0].name);
  const [variableTypeErrorText, setVariableTypeErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [initialSyncBehavior, setInitialSyncBehavior] = useState("prefer-source");

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

      setVariableTypeErrorText("");
      if (variableType.length === 0) {
        setVariableTypeErrorText("Variable Type cannot be blank!");
        return;
      }

      setIsLoading(true);

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: targetApp,
        appId: integrationAuthApps?.find(
          (integrationAuthApp) => integrationAuthApp.name === targetApp
        )?.appId,
        sourceEnvironment: selectedSourceEnvironment,
        targetService: variableType,
        secretPath,
        metadata: {
          initialSyncBehavior
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

  return integrationAuth && selectedSourceEnvironment && integrationAuthApps && targetApp ? (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Create Terraform Cloud Integration</title>
      </Helmet>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Specify the encironment and path within Infisical that you want to push to which project in Terraform."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <img
                src="/images/integrations/Terraform.png"
                height={35}
                width={35}
                alt="Terraform logo"
              />
            </div>
            <span className="ml-1.5">Terraform Cloud Integration </span>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://infisical.com/docs/integrations/cloud/terraform-cloud"
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
        <FormControl label="Project Environment" className="px-6">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {currentProject?.environments.map((sourceEnvironment) => (
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
        <FormControl
          label="Category"
          className="px-6"
          errorText={variableTypeErrorText}
          isError={variableTypeErrorText !== ""}
        >
          <Select
            value={variableType}
            onValueChange={(val) => setVariableType(val)}
            className="w-full border border-mineshaft-500"
          >
            {variableTypes.map((variable) => (
              <SelectItem value={variable.name} key={`target-app-${variable.name}`}>
                {variable.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <FormControl label="Terraform Cloud Project" className="px-6">
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
                No project found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <FormControl label="Initial Sync Behavior" className="px-6">
          <Select
            value={initialSyncBehavior}
            onValueChange={(e) => setInitialSyncBehavior(e)}
            className="w-full border border-mineshaft-600"
          >
            {initialSyncBehaviors.map((b) => {
              return (
                <SelectItem value={b.value} key={`sync-behavior-${b.value}`}>
                  {b.label}
                </SelectItem>
              );
            })}
          </Select>
        </FormControl>
        <Button
          onClick={handleButtonClick}
          colorSchema="primary"
          variant="outline_bg"
          className="mt-2 mr-6 mb-6 ml-auto w-min"
          isLoading={isLoading}
          isDisabled={integrationAuthApps.length === 0}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div />
  );
};
