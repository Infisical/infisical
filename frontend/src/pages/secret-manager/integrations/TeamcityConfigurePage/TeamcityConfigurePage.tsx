import { useEffect, useState } from "react";
import { faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  DocumentationLinkBadge,
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
  useGetIntegrationAuthById,
  useGetIntegrationAuthTeamCityBuildConfigs
} from "@app/hooks/api/integrationAuth";
import { IntegrationsListPageTabs } from "@app/types/integrations";

export const TeamcityConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending: isLoading } = useCreateIntegration();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.TeamcityConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
  const [targetAppId, setTargetAppId] = useState("");
  const [targetBuildConfigId, setTargetBuildConfigId] = useState<string>("");
  const [secretPath, setSecretPath] = useState("/");

  const { data: integrationAuth, isPending: isIntegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );
  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });

  const { data: targetBuildConfigs } = useGetIntegrationAuthTeamCityBuildConfigs({
    integrationAuthId: (integrationAuthId as string) ?? "",
    appId: targetAppId
  });

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

      const targetEnvironment = targetBuildConfigs?.find(
        (buildConfig) => buildConfig.buildConfigId === targetBuildConfigId
      );

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: integrationAuthApps?.find(
          (integrationAuthApp) => integrationAuthApp.appId === targetAppId
        )?.name,
        appId: targetAppId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: targetEnvironment?.name,
        targetEnvironmentId: targetEnvironment?.buildConfigId,
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
    targetBuildConfigs &&
    targetAppId ? (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up TeamCity Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/TeamCity.png"
              height={28}
              width={28}
              alt="TeamCity logo"
            />
            TeamCity Integration
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/teamcity" />
          </CardTitle>
          <CardDescription>
            Choose which environment or folders in Infisical you want to sync to which project in
            TeamCity.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="TeamcityConfigurePage-field-1">Project Environment</FieldLabel>
            <Select
              value={selectedSourceEnvironment}
              onValueChange={(val) => setSelectedSourceEnvironment(val)}
            >
              <SelectTrigger
                id="TeamcityConfigurePage-field-1"
                aria-describedby="TeamcityConfigurePage-field-1-feedback"
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
            <FieldLabel htmlFor="TeamcityConfigurePage-field-2">Secrets Path</FieldLabel>
            <Input
              id="TeamcityConfigurePage-field-2"
              aria-describedby="TeamcityConfigurePage-field-2-feedback"
              value={secretPath}
              onChange={(evt) => setSecretPath(evt.target.value)}
              placeholder="Provide a path, default is /"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="TeamcityConfigurePage-field-3">TeamCity Project</FieldLabel>
            <Select
              value={targetAppId}
              onValueChange={(val) => setTargetAppId(val)}
              disabled={integrationAuthApps.length === 0}
            >
              <SelectTrigger
                id="TeamcityConfigurePage-field-3"
                aria-describedby="TeamcityConfigurePage-field-3-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
                    No projects found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="TeamcityConfigurePage-field-4">
              Team City Build Config (Optional)
            </FieldLabel>
            <Select
              value={targetBuildConfigId}
              onValueChange={(val) => setTargetBuildConfigId(val)}
              disabled={targetBuildConfigs.length === 0}
            >
              <SelectTrigger
                id="TeamcityConfigurePage-field-4"
                aria-describedby="TeamcityConfigurePage-field-4-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targetBuildConfigs.length ? (
                  targetBuildConfigs.map((buildConfig: any) => (
                    <SelectItem
                      value={buildConfig.buildConfigId}
                      key={`target-build-config-${buildConfig.buildConfigId}`}
                    >
                      {buildConfig.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" key="target-app-none">
                    No build configs found
                  </SelectItem>
                )}
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
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up TeamCity Integration" />
      {isIntegrationAuthLoading || isIntegrationAuthAppsLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-border-control bg-surface-raised p-6 text-center text-foreground-secondary">
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-foreground underline decoration-project underline-offset-4 opacity-80 duration-200 hover:opacity-100"
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
