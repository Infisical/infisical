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

export const CodefreshConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.CodefreshConfigurePage.id,
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
  const [isLoading, setIsLoading] = useState(false);

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
        app: targetApp,
        appId: integrationAuthApps?.find(
          (integrationAuthApp) => integrationAuthApp.name === targetApp
        )?.appId,
        sourceEnvironment: selectedSourceEnvironment,
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
    } finally {
      setIsLoading(false);
    }
  };

  return integrationAuth && selectedSourceEnvironment && integrationAuthApps && targetApp ? (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Codefresh Integration" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Codefresh Integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field className="mt-4" data-invalid={false}>
            <FieldLabel htmlFor="codefresh-project-environment">Project Environment</FieldLabel>
            <Select
              value={selectedSourceEnvironment}
              onValueChange={(val) => setSelectedSourceEnvironment(val)}
            >
              <SelectTrigger className="w-full" id="codefresh-project-environment">
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
          <Field data-invalid={false}>
            <FieldLabel htmlFor="codefresh-secrets-path">Secrets Path</FieldLabel>
            <Input
              value={secretPath}
              onChange={(evt) => setSecretPath(evt.target.value)}
              placeholder="Provide a path, default is /"
              id="codefresh-secrets-path"
            />
          </Field>
          <Field className="mt-4" data-invalid={false}>
            <FieldLabel htmlFor="codefresh-codefresh-service">Codefresh Service</FieldLabel>
            <Select
              value={targetApp}
              onValueChange={(val) => setTargetApp(val)}
              disabled={integrationAuthApps.length === 0}
            >
              <SelectTrigger className="w-full" id="codefresh-codefresh-service">
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
                    No services found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            onClick={handleButtonClick}
            isPending={isLoading}
            isDisabled={integrationAuthApps.length === 0}
            variant="outline"
          >
            Create Integration
          </Button>
        </CardFooter>
      </Card>
    </div>
  ) : (
    <>
      <PageTitle title="Set Up Codefresh Integration" />
      <div />
    </>
  );
};
