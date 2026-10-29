import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration, useGetWorkspaceById } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "@app/hooks/api/integrationAuth";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const cloudflareEnvironments = [
  { name: "Production", slug: "production" },
  { name: "Preview", slug: "preview" }
];

export const CloudflarePagesConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.CloudflarePagesConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const [secretPath, setSecretPath] = useState("/");
  const { data: workspace } = useGetWorkspaceById(currentProject.id);
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [targetApp, setTargetApp] = useState("");
  const [targetAppId, setTargetAppId] = useState("");
  const [targetEnvironment, setTargetEnvironment] = useState("");
  const [shouldAutoRedeploy, setShouldAutoRedeploy] = useState(false);

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
        setTargetAppId(String(integrationAuthApps[0].appId));
        setTargetEnvironment(cloudflareEnvironments[0].slug);
      } else {
        setTargetApp("none");
        setTargetEnvironment(cloudflareEnvironments[0].slug);
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
        appId: targetAppId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment,
        secretPath,
        metadata: {
          shouldAutoRedeploy
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
    } catch {
      setIsLoading(false);
    }
  };

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    targetEnvironment &&
    targetApp ? (
    <div className="flex h-full w-full items-center justify-center bg-linear-to-tr from-surface-base to-page-deep">
      <PageTitle title="Set Up Cloudflare Pages Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Cloudflare Pages Integration</CardTitle>
          <CardDescription>
            Choose which environment in Infisical you want to sync with your Cloudflare Pages
            project.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field className="mt-2" data-invalid={false}>
            <FieldLabel htmlFor="cloudflarepages-infisical-project-environment">
              Infisical Project Environment
            </FieldLabel>
            <Select
              value={selectedSourceEnvironment}
              onValueChange={(val) => setSelectedSourceEnvironment(val)}
            >
              <SelectTrigger className="w-full" id="cloudflarepages-infisical-project-environment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workspace?.environments.map((sourceEnvironment) => (
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
          <Field className="mt-2" data-invalid={false}>
            <FieldLabel htmlFor="cloudflarepages-infisical-secret-path">
              Infisical Secret Path
            </FieldLabel>
            <SecretPathInput
              value={secretPath}
              onChange={(value) => setSecretPath(value)}
              environment={selectedSourceEnvironment}
              placeholder="Provide a path, default is /"
              id="cloudflarepages-infisical-secret-path"
            />
          </Field>
          <Field className="mt-4" data-invalid={false}>
            <FieldLabel htmlFor="cloudflarepages-cloudflare-pages-project">
              Cloudflare Pages Project
            </FieldLabel>
            <Select
              value={targetApp}
              onValueChange={(val) => setTargetApp(val)}
              disabled={integrationAuthApps.length === 0}
            >
              <SelectTrigger className="w-full" id="cloudflarepages-cloudflare-pages-project">
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
                    No apps found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </Field>
          <Field className="mt-4" data-invalid={false}>
            <FieldLabel htmlFor="cloudflarepages-cloudflare-pages-environment">
              Cloudflare Pages Environment
            </FieldLabel>
            <Select value={targetEnvironment} onValueChange={(val) => setTargetEnvironment(val)}>
              <SelectTrigger className="w-full" id="cloudflarepages-cloudflare-pages-environment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cloudflareEnvironments.map((cloudflareEnvironment) => (
                  <SelectItem
                    value={cloudflareEnvironment.slug}
                    key={`target-environment-${cloudflareEnvironment.slug}`}
                  >
                    {cloudflareEnvironment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {targetEnvironment === "production" && (
            <div className="mb-[2.36rem] ml-1">
              <Field orientation="horizontal">
                <FieldLabel htmlFor="redeploy-cloudflare-pages">
                  Auto-redeploy service upon secret change
                </FieldLabel>
                <Toggle
                  id="redeploy-cloudflare-pages"
                  onCheckedChange={(isChecked: boolean) => setShouldAutoRedeploy(isChecked)}
                  checked={shouldAutoRedeploy}
                  variant="project"
                />
              </Field>
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Create Integration
          </Button>
        </CardFooter>
      </Card>
    </div>
  ) : (
    <>
      <PageTitle title="Set Up Cloudflare Pages Integration" />
      <div />
    </>
  );
};
