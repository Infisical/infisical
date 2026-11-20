import { useEffect, useState } from "react";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "motion/react";

import { PageTitle } from "@app/components/PageTitle";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
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

      const targetApp = integrationAuthApps?.find(
        (integrationAuthApp) => integrationAuthApp.appId === targetAppId
      );
      const targetGroup = integrationAuthGroups?.find(
        (group) => group.groupId === Number(targetGroupId)
      );

      if (!targetApp) return;

      setIsLoading(true);

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

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    integrationAuthGroups &&
    targetAppId ? (
    <div className="flex h-full w-full flex-col items-center justify-center bg-linear-to-tr from-surface-base to-page-deep py-6">
      <PageTitle title="Set Up Checkly Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img src="/images/integrations/Checkly.png" height={30} width={30} alt="Checkly logo" />
            <span>Checkly Integration</span>
          </CardTitle>
          <CardDescription>
            Choose which environment in Infisical you want to sync to Checkly environment variables.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                href="https://infisical.com/docs/integrations/cloud/checkly"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Tabs defaultValue={TabSections.Connection}>
            <TabsList variant="project">
              <TabsTrigger value={TabSections.Connection}>Connection</TabsTrigger>
              <TabsTrigger value={TabSections.Options}>Options</TabsTrigger>
            </TabsList>
            <TabsContent value={TabSections.Connection}>
              <motion.div
                key="panel-1"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
              >
                <Field className="mb-4" data-invalid={false}>
                  <FieldLabel htmlFor="checkly-infisical-project-environment">
                    Infisical Project Environment
                  </FieldLabel>
                  <Select
                    value={selectedSourceEnvironment}
                    onValueChange={(val) => setSelectedSourceEnvironment(val)}
                  >
                    <SelectTrigger className="w-full" id="checkly-infisical-project-environment">
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
                <Field className="mb-4" data-invalid={false}>
                  <FieldLabel htmlFor="checkly-secrets-path">Secrets Path</FieldLabel>
                  <Input
                    value={secretPath}
                    onChange={(evt) => setSecretPath(evt.target.value)}
                    placeholder="Provide a path, default is /"
                    id="checkly-secrets-path"
                  />
                </Field>
                <Field className="mb-4" data-invalid={false}>
                  <FieldLabel htmlFor="checkly-checkly-account">Checkly Account</FieldLabel>
                  <Select
                    value={targetAppId}
                    onValueChange={(val) => setTargetAppId(val)}
                    disabled={integrationAuthApps.length === 0}
                  >
                    <SelectTrigger className="w-full" id="checkly-checkly-account">
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
                          No apps found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="mb-4" data-invalid={false}>
                  <FieldLabel htmlFor="checkly-checkly-group-optional-">
                    Checkly Group (Optional)
                  </FieldLabel>
                  <Select value={targetGroupId} onValueChange={(val) => setTargetGroupId(val)}>
                    <SelectTrigger className="w-full" id="checkly-checkly-group-optional-">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                    </SelectContent>
                  </Select>
                </Field>
              </motion.div>
            </TabsContent>
            <TabsContent value={TabSections.Options}>
              <motion.div
                key="panel-1"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: -30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
              >
                <Field className="mb-4 pb-39" data-invalid={false}>
                  <FieldLabel htmlFor="checkly-append-secret-names-with-">
                    Append Secret Names with...
                  </FieldLabel>
                  <Input
                    value={secretSuffix}
                    onChange={(evt) => setSecretSuffix(evt.target.value)}
                    placeholder="Provide a suffix for secret names, default is no suffix"
                    id="checkly-append-secret-names-with-"
                  />
                </Field>
              </motion.div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Create Integration
          </Button>
        </CardFooter>
      </Card>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Checkly Integration" />
      {isIntegrationAuthAppsLoading || isintegrationAuthGroupsLoading ? (
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
