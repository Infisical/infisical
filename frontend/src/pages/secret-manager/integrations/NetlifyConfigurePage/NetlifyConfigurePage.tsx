import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
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
import { IntegrationsListPageTabs } from "@app/types/integrations";

const netlifyEnvironments = [
  { name: "Local development", slug: "dev" },
  { name: "Branch deploys", slug: "branch-deploy" },
  { name: "Deploy previews", slug: "deploy-preview" },
  { name: "Production", slug: "production" }
];

export const NetlifyConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending: isLoading } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.NetlifyConfigurePage.id,
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
  const [targetEnvironment, setTargetEnvironment] = useState(netlifyEnvironments[0].slug);
  const [secretPath, setSecretPath] = useState("/");

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

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: targetApp,
        appId: integrationAuthApps?.find(
          (integrationAuthApp) => integrationAuthApp.name === targetApp
        )?.appId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment,
        secretPath
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

  return integrationAuth &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    targetApp &&
    targetEnvironment ? (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Netlify Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Netlify Integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="NetlifyConfigurePage-field-1">Project Environment</FieldLabel>
            <Select
              value={selectedSourceEnvironment}
              onValueChange={(val) => setSelectedSourceEnvironment(val)}
            >
              <SelectTrigger
                id="NetlifyConfigurePage-field-1"
                aria-describedby="NetlifyConfigurePage-field-1-feedback"
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
          <Field>
            <FieldLabel htmlFor="NetlifyConfigurePage-field-2">Secrets Path</FieldLabel>
            <Input
              id="NetlifyConfigurePage-field-2"
              aria-describedby="NetlifyConfigurePage-field-2-feedback"
              value={secretPath}
              onChange={(evt) => setSecretPath(evt.target.value)}
              placeholder="Provide a path, default is /"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="NetlifyConfigurePage-field-3">Netlify Site</FieldLabel>
            <Select
              value={targetApp}
              onValueChange={(val) => setTargetApp(val)}
              disabled={integrationAuthApps.length === 0}
            >
              <SelectTrigger
                id="NetlifyConfigurePage-field-3"
                aria-describedby="NetlifyConfigurePage-field-3-feedback"
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
                    No sites found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="NetlifyConfigurePage-field-4">Netlify Context</FieldLabel>
            <Select value={targetEnvironment} onValueChange={(val) => setTargetEnvironment(val)}>
              <SelectTrigger
                id="NetlifyConfigurePage-field-4"
                aria-describedby="NetlifyConfigurePage-field-4-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {netlifyEnvironments.map((netlifyEnvironment) => (
                  <SelectItem
                    value={netlifyEnvironment.slug}
                    key={`target-environment-${netlifyEnvironment.slug}`}
                  >
                    {netlifyEnvironment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button
            onClick={handleButtonClick}
            isPending={isLoading}
            isDisabled={integrationAuthApps.length === 0}
            variant="project"
          >
            Create Integration
          </Button>
        </CardFooter>
      </Card>
    </div>
  ) : (
    <>
      <PageTitle title="Set Up Netlify Integration" />
      <div />
    </>
  );
};
