import { useEffect, useState } from "react";
import { faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "motion/react";

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
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import { useGetIntegrationAuthById } from "@app/hooks/api/integrationAuth";
import {
  useGetIntegrationAuthQoveryEnvironments,
  useGetIntegrationAuthQoveryOrgs,
  useGetIntegrationAuthQoveryProjects,
  useGetIntegrationAuthQoveryScopes
} from "@app/hooks/api/integrationAuth/queries";
import { IntegrationsListPageTabs } from "@app/types/integrations";

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

export const QoveryConfigurePage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { mutateAsync, isPending: isLoading } = useCreateIntegration();

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.QoveryConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  const [scope, setScope] = useState("application");
  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
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

  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthQoveryScopes({
      integrationAuthId: (integrationAuthId as string) ?? "",
      environmentId: targetEnvironmentId,
      scope: scope as "job" | "application" | "container"
    });
  const [targetAppId, setTargetAppId] = useState("");

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

  return integrationAuth && selectedSourceEnvironment ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <PageTitle title="Set Up Qovery Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img src="/images/integrations/Qovery.png" height={30} width={30} alt="Qovery logo" />
            Qovery Integration
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/qovery" />
          </CardTitle>
          <CardDescription>
            Choose which environment in Infisical you want to sync to Checkly environment variables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={TabSections.InfisicalSettings}>
            <TabsList variant="project">
              <TabsTrigger value={TabSections.InfisicalSettings}>Infisical Settings</TabsTrigger>
              <TabsTrigger value={TabSections.QoverySettings}>Qovery Settings</TabsTrigger>
            </TabsList>
            <TabsContent value={TabSections.InfisicalSettings}>
              <motion.div
                key="panel-1"
                className="flex flex-col gap-4"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
              >
                <Field>
                  <FieldLabel htmlFor="QoveryConfigurePage-field-1">
                    Infisical Project Environment
                  </FieldLabel>
                  <Select
                    value={selectedSourceEnvironment}
                    onValueChange={(val) => setSelectedSourceEnvironment(val)}
                  >
                    <SelectTrigger
                      id="QoveryConfigurePage-field-1"
                      aria-describedby="QoveryConfigurePage-field-1-feedback"
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
                  <FieldLabel htmlFor="QoveryConfigurePage-field-2">Secrets Path</FieldLabel>
                  <Input
                    id="QoveryConfigurePage-field-2"
                    aria-describedby="QoveryConfigurePage-field-2-feedback"
                    value={secretPath}
                    onChange={(evt) => setSecretPath(evt.target.value)}
                    placeholder="Provide a path, default is /"
                  />
                </Field>
              </motion.div>
            </TabsContent>
            <TabsContent value={TabSections.QoverySettings}>
              <motion.div
                key="panel-1"
                className="flex flex-col gap-4"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: -30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
              >
                <Field>
                  <FieldLabel htmlFor="QoveryConfigurePage-field-3">Qovery Scope</FieldLabel>
                  <Select value={scope} onValueChange={(val) => setScope(val)}>
                    <SelectTrigger
                      id="QoveryConfigurePage-field-3"
                      aria-describedby="QoveryConfigurePage-field-3-feedback"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {qoveryScopes.map((qoveryScope) => (
                        <SelectItem
                          value={qoveryScope.value}
                          key={`target-app-${qoveryScope.value}`}
                        >
                          {qoveryScope.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {integrationAuthOrgs && (
                  <Field>
                    <FieldLabel htmlFor="QoveryConfigurePage-field-4">
                      Qovery Organization
                    </FieldLabel>
                    <Select
                      value={targetOrgId}
                      onValueChange={(val) => setTargetOrgId(val)}
                      disabled={integrationAuthOrgs.length === 0}
                    >
                      <SelectTrigger
                        id="QoveryConfigurePage-field-4"
                        aria-describedby="QoveryConfigurePage-field-4-feedback"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
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
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {integrationAuthProjects && (
                  <Field>
                    <FieldLabel htmlFor="QoveryConfigurePage-field-5">Qovery Project</FieldLabel>
                    <Select
                      value={targetProjectId}
                      onValueChange={(val) => setTargetProjectId(val)}
                      disabled={integrationAuthProjects.length === 0}
                    >
                      <SelectTrigger
                        id="QoveryConfigurePage-field-5"
                        aria-describedby="QoveryConfigurePage-field-5-feedback"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
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
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {integrationAuthEnvironments && (
                  <Field>
                    <FieldLabel htmlFor="QoveryConfigurePage-field-6">
                      Qovery Environment
                    </FieldLabel>
                    <Select
                      value={targetEnvironmentId}
                      onValueChange={(val) => setTargetEnvironmentId(val)}
                      disabled={integrationAuthEnvironments.length === 0}
                    >
                      <SelectTrigger
                        id="QoveryConfigurePage-field-6"
                        aria-describedby="QoveryConfigurePage-field-6-feedback"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
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
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {scope && integrationAuthApps && (
                  <Field>
                    <FieldLabel htmlFor="QoveryConfigurePage-field-7">{`Qovery ${scope.charAt(0).toUpperCase() + scope.slice(1)}`}</FieldLabel>
                    <Select
                      value={targetAppId}
                      onValueChange={(val) => setTargetAppId(val)}
                      disabled={integrationAuthApps.length === 0}
                    >
                      <SelectTrigger
                        id="QoveryConfigurePage-field-7"
                        aria-describedby="QoveryConfigurePage-field-7-feedback"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
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
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </motion.div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Create Integration
          </Button>
        </CardFooter>
      </Card>
      {/* <div className="border-t border-border-faint w-full max-w-md mt-6"/>
      <div className="flex flex-col bg-surface-raised border border-border-control w-full p-4 max-w-lg mt-6 rounded-md">
        <div className="flex flex-row items-center"><FontAwesomeIcon icon={faCircleInfo} className="text-foreground-secondary text-xl"/> <span className="ml-3 text-md text-foreground">Pro Tip</span></div>
        <span className="text-label text-sm mt-4">After creating an integration, your secrets will start syncing immediately. This might cause an unexpected override of current secrets in Qovery with secrets from Infisical.</span>
      </div> */}
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Qovery Integration" />
      {isIntegrationAuthAppsLoading ? (
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
