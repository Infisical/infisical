import { useEffect, useState } from "react";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import {
  Alert,
  AlertDescription,
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

export const FlyioConfigurePage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { mutateAsync } = useCreateIntegration();

  const { currentProject } = useProject();

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.FlyioConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth, isPending: isIntegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );
  const { data: integrationAuthApps = [], isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
  const [secretPath, setSecretPath] = useState("/");

  const [targetApp, setTargetApp] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // TODO: handle case where apps can be empty
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
    <div className="flex h-full w-full flex-col items-center justify-center">
      <PageTitle title="Set Up Fly.io Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img src="/images/integrations/Flyio.svg" height={30} width={30} alt="Fly.io logo" />
            <span>Fly.io Integration</span>
          </CardTitle>
          <CardDescription>
            Choose which environment or folder in Infisical you want to sync to Fly.io environment
            variables.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                href="https://infisical.com/docs/integrations/cloud/flyio"
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
          <div className="pb-4">
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>
                All current secrets linked to the related Fly.io project will be deleted before
                Infisical secrets are pushed to your Fly.io project.
              </AlertDescription>
            </Alert>
          </div>
          <Field data-invalid={false}>
            <FieldLabel htmlFor="flyio-project-environment">Project Environment</FieldLabel>
            <Select
              value={selectedSourceEnvironment}
              onValueChange={(val) => setSelectedSourceEnvironment(val)}
            >
              <SelectTrigger className="w-full" id="flyio-project-environment">
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
            <FieldLabel htmlFor="flyio-secrets-path">Secrets Path</FieldLabel>
            <Input
              value={secretPath}
              onChange={(evt) => setSecretPath(evt.target.value)}
              placeholder="Provide a path, default is /"
              id="flyio-secrets-path"
            />
          </Field>
          <Field data-invalid={false}>
            <FieldLabel htmlFor="flyio-fly-io-app">Fly.io App</FieldLabel>
            <Select
              value={targetApp}
              onValueChange={(val) => setTargetApp(val)}
              disabled={integrationAuthApps.length === 0}
            >
              <SelectTrigger className="w-full" id="flyio-fly-io-app">
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
        </CardContent>
        <CardFooter className="justify-end">
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
      <div className="mt-6 w-full max-w-md border-t border-border-faint" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-border-control bg-surface-raised p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-foreground-secondary" />{" "}
          <span className="text-md ml-3 text-foreground">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-label">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in Fly.io with secrets from Infisical.
        </span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Fly.io Integration" />
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
