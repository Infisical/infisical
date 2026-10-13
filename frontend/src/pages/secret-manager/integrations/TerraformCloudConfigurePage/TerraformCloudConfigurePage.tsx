import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
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
  const { mutateAsync, isPending: isLoading } = useCreateIntegration();

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
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
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
                <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-warning/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-warning opacity-80 hover:opacity-100">
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
          <CardDescription>
            Specify the encironment and path within Infisical that you want to push to which project
            in Terraform.
          </CardDescription>
        </CardHeader>
        <Field className="mb-4 px-6">
          <FieldLabel htmlFor="TerraformCloudConfigurePage-field-1">Project Environment</FieldLabel>
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
          >
            <SelectTrigger
              id="TerraformCloudConfigurePage-field-1"
              aria-describedby="TerraformCloudConfigurePage-field-1-feedback"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currentProject?.environments.map((sourceEnvironment) => (
                <SelectItem
                  value={sourceEnvironment.slug}
                  key={`source-environment-${sourceEnvironment.slug}`}
                >
                  {sourceEnvironment.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="mb-4 px-6">
          <FieldLabel htmlFor="TerraformCloudConfigurePage-field-2">Secrets Path</FieldLabel>
          <Input
            id="TerraformCloudConfigurePage-field-2"
            aria-describedby="TerraformCloudConfigurePage-field-2-feedback"
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </Field>
        <Field className="mb-4 px-6" data-invalid={variableTypeErrorText !== ""}>
          <FieldLabel htmlFor="TerraformCloudConfigurePage-field-3">Category</FieldLabel>
          <Select value={variableType} onValueChange={(val) => setVariableType(val)}>
            <SelectTrigger
              id="TerraformCloudConfigurePage-field-3"
              aria-describedby="TerraformCloudConfigurePage-field-3-feedback"
              isError={variableTypeErrorText !== ""}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {variableTypes.map((variable) => (
                <SelectItem value={variable.name} key={`target-app-${variable.name}`}>
                  {variable.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {variableTypeErrorText !== "" && (
            <FieldError id="TerraformCloudConfigurePage-field-3-feedback">
              {variableTypeErrorText}
            </FieldError>
          )}
        </Field>
        <Field className="mb-4 px-6">
          <FieldLabel htmlFor="TerraformCloudConfigurePage-field-4">
            Terraform Cloud Project
          </FieldLabel>
          <Select
            value={targetApp}
            onValueChange={(val) => setTargetApp(val)}
            disabled={integrationAuthApps.length === 0}
          >
            <SelectTrigger
              id="TerraformCloudConfigurePage-field-4"
              aria-describedby="TerraformCloudConfigurePage-field-4-feedback"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
            </SelectContent>
          </Select>
        </Field>
        <Field className="mb-4 px-6">
          <FieldLabel htmlFor="TerraformCloudConfigurePage-field-5">
            Initial Sync Behavior
          </FieldLabel>
          <Select value={initialSyncBehavior} onValueChange={(e) => setInitialSyncBehavior(e)}>
            <SelectTrigger
              id="TerraformCloudConfigurePage-field-5"
              aria-describedby="TerraformCloudConfigurePage-field-5-feedback"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {initialSyncBehaviors.map((b) => {
                return (
                  <SelectItem value={b.value} key={`sync-behavior-${b.value}`}>
                    {b.label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </Field>
        <Button
          onClick={handleButtonClick}
          className="mt-2 mr-6 mb-6 ml-auto w-min"
          isPending={isLoading}
          disabled={integrationAuthApps.length === 0}
          variant="project"
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div />
  );
};
