import { useState } from "react";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
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

export const DatabricksConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useCreateIntegration();

  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.DatabricksConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth, isPending: isintegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );

  const { data: integrationAuthScopes, isPending: isIntegrationAuthScopesLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
  const [targetScope, setTargetScope] = useState("");
  const [secretPath, setSecretPath] = useState("/");

  const handleButtonClick = async () => {
    if (!integrationAuth?.id) return;

    if (!targetScope) {
      createNotification({
        type: "error",
        text: "Please select a scope"
      });
      return;
    }

    const selectedScope = integrationAuthScopes?.find(
      (integrationAuthScope) => integrationAuthScope.name === targetScope
    );

    if (!selectedScope) {
      createNotification({
        type: "error",
        text: "Invalid scope selected"
      });
      return;
    }

    await mutateAsync({
      integrationAuthId: integrationAuth?.id,
      isActive: true,
      app: selectedScope.name, // scope name
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
  };

  return integrationAuth && selectedSourceEnvironment && integrationAuthScopes ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <PageTitle title="Set Up Databricks Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/Databricks.png"
              height={30}
              width={30}
              alt="Databricks logo"
            />
            <span>Databricks Integration</span>
          </CardTitle>
          <CardDescription>
            Choose which environment or folder in Infisical you want to sync to which Databricks
            secrets scope.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                href="https://infisical.com/docs/integrations/cloud/databricks"
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
          <Field data-invalid={false}>
            <FieldLabel htmlFor="databricks-project-environment">Project Environment</FieldLabel>
            <Select
              value={selectedSourceEnvironment}
              onValueChange={(val) => setSelectedSourceEnvironment(val)}
            >
              <SelectTrigger className="w-full" id="databricks-project-environment">
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
            <FieldLabel htmlFor="databricks-secrets-path">Secrets Path</FieldLabel>
            <Input
              value={secretPath}
              onChange={(evt) => setSecretPath(evt.target.value)}
              placeholder="Provide a path, default is /"
              id="databricks-secrets-path"
            />
          </Field>
          {integrationAuthScopes && (
            <Field data-invalid={false}>
              <FieldLabel htmlFor="databricks-databricks-scope">Databricks Scope</FieldLabel>
              <Select
                value={targetScope}
                onValueChange={(val) => {
                  setTargetScope(val);
                }}
                disabled={integrationAuthScopes.length === 0}
              >
                <SelectTrigger className="w-full" id="databricks-databricks-scope">
                  <SelectValue
                    placeholder={
                      integrationAuthScopes.length === 0 ? "No scopes found." : "Select scope..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {integrationAuthScopes.length > 0 ? (
                    integrationAuthScopes.map((scope) => (
                      <SelectItem value={scope.name!} key={`target-scope-${scope.name}`}>
                        {scope.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" key="target-app-none">
                      No scopes found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Field>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            onClick={handleButtonClick}
            isPending={isPending}
            isDisabled={integrationAuthScopes.length === 0 || isPending}
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
          When integrating with Databricks, Infisical is intended to be the source of truth for the
          secrets in the configured Databricks scope.
        </span>
        <span className="mt-4 text-sm text-label">
          Any secrets not present in Infisical will be removed from the specified scope. To prevent
          removal of secrets not managed by Infisical, Infisical recommends creating a designated
          secret scope for your integration.
        </span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Databricks Integration" />
      {isIntegrationAuthScopesLoading || isintegrationAuthLoading ? (
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
