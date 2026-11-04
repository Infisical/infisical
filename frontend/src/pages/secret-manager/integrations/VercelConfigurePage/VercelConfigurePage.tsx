import { useEffect, useMemo, useState } from "react";
import { faBugs, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthVercelBranches,
  useGetIntegrationAuthVercelCustomEnvironments
} from "@app/hooks/api/integrationAuth";
import { IntegrationSyncBehavior } from "@app/hooks/api/integrations/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const vercelEnvironments = [
  { name: "Development", slug: "development" },
  { name: "Preview", slug: "preview" },
  { name: "Production", slug: "production" }
];

const initialSyncBehaviors = [
  {
    label: "No Import - Overwrite all values in Vercel",
    value: IntegrationSyncBehavior.OVERWRITE_TARGET
  },
  {
    label: "Import - Prefer values from Infisical",
    value: IntegrationSyncBehavior.PREFER_SOURCE
  }
];

export const VercelConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending: isLoading } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
  const [secretPath, setSecretPath] = useState("/");
  const [initialSyncBehavior, setInitialSyncBehavior] = useState<IntegrationSyncBehavior>(
    IntegrationSyncBehavior.PREFER_SOURCE
  );
  const [targetAppId, setTargetAppId] = useState("");
  const [targetEnvironment, setTargetEnvironment] = useState("");
  const [targetBranch, setTargetBranch] = useState("");

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.VercelConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? "",
      teamId: integrationAuth?.teamId as string
    });

  const { data: customEnvironments } = useGetIntegrationAuthVercelCustomEnvironments({
    teamId: integrationAuth?.teamId as string,
    integrationAuthId: integrationAuthId as string
  });

  const { data: branches } = useGetIntegrationAuthVercelBranches({
    integrationAuthId: integrationAuthId as string,
    appId: targetAppId
  });

  const filteredBranches = branches?.filter((branchName) => branchName !== "main").concat();

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetAppId(integrationAuthApps[0].appId as string);
        setTargetEnvironment(vercelEnvironments[0].slug);
      } else {
        setTargetAppId("none");
        setTargetEnvironment(vercelEnvironments[0].slug);
      }
    }
  }, [integrationAuthApps]);

  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?.id) return;

      const targetApp = integrationAuthApps?.find(
        (integrationAuthApp) => integrationAuthApp.appId === targetAppId
      );

      if (!targetApp || !targetApp.appId) return;

      const path =
        targetEnvironment === "preview" && targetBranch !== "" ? targetBranch : undefined;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: targetApp.name,
        appId: targetApp.appId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment,
        path,
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

  const selectedVercelEnvironments = useMemo(() => {
    let selectedEnvironments = vercelEnvironments;

    const environments = customEnvironments?.find(
      (e) => e.appId === targetAppId
    )?.customEnvironments;

    if (environments && environments.length > 0) {
      selectedEnvironments = [
        ...selectedEnvironments,
        ...environments.map((env) => ({
          name: env.slug,
          slug: env.id
        }))
      ];
    }

    return selectedEnvironments;
  }, [targetAppId, customEnvironments]);

  return integrationAuth &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    targetAppId &&
    targetEnvironment ? (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6">
      <PageTitle title="Set Up Vercel Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img src="/images/integrations/Vercel.png" height={30} width={30} alt="Vercel logo" />
            Vercel Integration
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/vercel" />
          </CardTitle>
          <CardDescription>
            Select which environment or folder in Infisical you want to sync to Vercel&apos;s
            environment variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="VercelConfigurePage-field-1">
              Infisical Project Environment
            </FieldLabel>
            <Select
              value={selectedSourceEnvironment}
              onValueChange={(val) => setSelectedSourceEnvironment(val)}
            >
              <SelectTrigger
                id="VercelConfigurePage-field-1"
                aria-describedby="VercelConfigurePage-field-1-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currentProject?.environments.map((sourceEnvironment) => (
                  <SelectItem
                    value={sourceEnvironment.slug}
                    key={`azure-key-vault-environment-${sourceEnvironment.slug}`}
                  >
                    {sourceEnvironment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="VercelConfigurePage-field-2">Secrets Path</FieldLabel>
            <Input
              id="VercelConfigurePage-field-2"
              aria-describedby="VercelConfigurePage-field-2-feedback"
              value={secretPath}
              onChange={(evt) => setSecretPath(evt.target.value)}
              placeholder="Provide a path, default is /"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="VercelConfigurePage-field-3">Vercel App</FieldLabel>
            <Select
              value={targetAppId}
              onValueChange={(val) => {
                if (vercelEnvironments.every((env) => env.slug !== targetEnvironment)) {
                  setTargetEnvironment(vercelEnvironments[0].slug);
                }

                setTargetAppId(val);
              }}
              disabled={integrationAuthApps.length === 0}
            >
              <SelectTrigger
                id="VercelConfigurePage-field-3"
                aria-describedby="VercelConfigurePage-field-3-feedback"
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
            <FieldDescription id="VercelConfigurePage-field-3-feedback">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <span>Don&#39;t see the project you&#39;re looking for?</span>{" "}
                    <FontAwesomeIcon icon={faCircleInfo} className="text-muted" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  {
                    "Double check Infisical's access permissions in Vercel by navigating to Team > Integrations > Infisical > Settings > Manage Access."
                  }
                </TooltipContent>
              </Tooltip>
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="VercelConfigurePage-field-4">Vercel App Environment</FieldLabel>
            <Select value={targetEnvironment} onValueChange={(val) => setTargetEnvironment(val)}>
              <SelectTrigger
                id="VercelConfigurePage-field-4"
                aria-describedby="VercelConfigurePage-field-4-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectedVercelEnvironments.map((vercelEnvironment) => (
                  <SelectItem
                    value={vercelEnvironment.slug}
                    key={`target-environment-${vercelEnvironment.slug}`}
                  >
                    {vercelEnvironment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {targetEnvironment === "preview" && filteredBranches && (
            <Field>
              <FieldLabel htmlFor="VercelConfigurePage-field-5">
                Vercel Preview Branch (Optional)
              </FieldLabel>
              <Select value={targetBranch} onValueChange={(val) => setTargetBranch(val)}>
                <SelectTrigger
                  id="VercelConfigurePage-field-5"
                  aria-describedby="VercelConfigurePage-field-5-feedback"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filteredBranches.map((branchName) => (
                    <SelectItem value={branchName} key={`target-branch-${branchName}`}>
                      {branchName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="VercelConfigurePage-field-6">Initial Sync Behavior</FieldLabel>
            <Select
              value={initialSyncBehavior}
              onValueChange={(val) => setInitialSyncBehavior(val as IntegrationSyncBehavior)}
            >
              <SelectTrigger
                id="VercelConfigurePage-field-6"
                aria-describedby="VercelConfigurePage-field-6-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {initialSyncBehaviors.map((syncBehavior) => (
                  <SelectItem
                    value={syncBehavior.value}
                    key={`sync-behavior-${syncBehavior.value}`}
                  >
                    {syncBehavior.label}
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
      <Alert variant="info" className="w-full max-w-lg">
        <InfoIcon />
        <AlertTitle>Pro Tip</AlertTitle>
        <AlertDescription>
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in Vercel with secrets from Infisical.
        </AlertDescription>
      </Alert>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Vercel Integration" />
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
