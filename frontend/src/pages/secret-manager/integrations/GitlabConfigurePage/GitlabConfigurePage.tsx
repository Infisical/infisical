import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "motion/react";
import { z } from "zod";

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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthTeams
} from "@app/hooks/api/integrationAuth";
import { IntegrationSyncBehavior } from "@app/hooks/api/integrations/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const gitLabEntities = [
  { name: "Individual", value: "individual" },
  { name: "Group", value: "group" }
] as const;

enum TabSections {
  Connection = "connection",
  Options = "options"
}

const initialSyncBehaviors = [
  {
    label: "No Import - Overwrite all values in GitLab",
    value: IntegrationSyncBehavior.OVERWRITE_TARGET
  },
  { label: "Import - Prefer values from Infisical", value: IntegrationSyncBehavior.PREFER_SOURCE }
];

const schema = z.object({
  targetEntity: z.enum([gitLabEntities[0].value, gitLabEntities[1].value]),
  targetTeamId: z.string().optional(),
  selectedSourceEnvironment: z.string(),
  secretPath: z.string(),
  targetAppId: z.string(),
  targetEnvironment: z.string().optional(),
  secretPrefix: z.string().optional(),
  secretSuffix: z.string().optional(),
  shouldMaskSecrets: z.boolean().optional(),
  shouldProtectSecrets: z.boolean().default(false),
  initialSyncBehavior: z.nativeEnum(IntegrationSyncBehavior)
});

type FormData = z.infer<typeof schema>;

export const GitlabConfigurePage = () => {
  const navigate = useNavigate();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["confirmIntegration"] as const);
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { control, handleSubmit, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      targetEntity: "individual",
      secretPath: "/",
      secretPrefix: "",
      secretSuffix: "",
      selectedSourceEnvironment: currentProject.environments[0].slug,
      initialSyncBehavior: IntegrationSyncBehavior.PREFER_SOURCE
    }
  });
  const selectedSourceEnvironment = watch("selectedSourceEnvironment");
  const targetEntity = watch("targetEntity");
  const targetTeamId = watch("targetTeamId");
  const targetAppIdValue = watch("targetAppId");

  const { mutateAsync } = useCreateIntegration();

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.GitlabConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? "",
      ...(targetTeamId ? { teamId: targetTeamId } : {})
    });
  const { data: integrationAuthTeams, isPending: isintegrationAuthTeamsLoading } =
    useGetIntegrationAuthTeams((integrationAuthId as string) ?? "");

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setValue("targetAppId", String(integrationAuthApps[0].appId as string));
      } else {
        setValue("targetAppId", "none");
      }
    }
  }, [integrationAuthApps]);

  useEffect(() => {
    if (targetEntity === "group" && integrationAuthTeams && integrationAuthTeams.length > 0) {
      if (integrationAuthTeams) {
        if (integrationAuthTeams.length > 0) {
          // case: user is part of at least 1 group in GitLab
          setValue("targetTeamId", String(integrationAuthTeams[0].id));
        } else {
          // case: user is not part of any groups in GitLab
          setValue("targetTeamId", "none");
        }
      }
    } else if (targetEntity === "individual") {
      setValue("targetTeamId", undefined);
    }
  }, [targetEntity, integrationAuthTeams]);

  const onFormSubmit = async ({
    selectedSourceEnvironment: sse,
    secretPath,
    targetAppId,
    targetEnvironment,
    secretPrefix,
    secretSuffix,
    shouldMaskSecrets,
    shouldProtectSecrets,
    initialSyncBehavior
  }: FormData) => {
    try {
      setIsLoading(true);
      if (!integrationAuth?.id) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: integrationAuthApps?.find(
          (integrationAuthApp) => String(integrationAuthApp.appId) === targetAppId
        )?.name,
        appId: String(targetAppId),
        sourceEnvironment: sse,
        targetEnvironment: targetEnvironment === "" ? "*" : targetEnvironment,
        secretPath,
        metadata: {
          secretPrefix,
          secretSuffix,
          shouldMaskSecrets,
          shouldProtectSecrets,
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
    } finally {
      setIsLoading(false);
    }
  };

  return integrationAuth &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    integrationAuthTeams ? (
    <form
      onSubmit={handleSubmit((data: FormData) => {
        if (
          !data.secretPrefix &&
          !data.secretSuffix &&
          data.initialSyncBehavior === IntegrationSyncBehavior.OVERWRITE_TARGET
        ) {
          handlePopUpOpen("confirmIntegration", data);
          return;
        }

        onFormSubmit(data);
      })}
      className="flex h-full w-full flex-col items-center justify-center"
    >
      <PageTitle title="Set Up GitLab Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img src="/images/integrations/GitLab.png" height={28} width={28} alt="Gitlab logo" />
            <span>GitLab Integration</span>
          </CardTitle>
          <CardDescription>
            Select which environment or folder in Infisical you want to sync to GitLab&apos;s
            environment variables.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                href="https://infisical.com/docs/integrations/cicd/gitlab"
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
                <Controller
                  control={control}
                  name="selectedSourceEnvironment"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <Field className="mb-4" data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="gitlab-selectedsourceenvironment">
                        Project Environment
                      </FieldLabel>
                      <Select
                        defaultValue={field.value}
                        onValueChange={(e) => onChange(e)}
                        name={field.name}
                        disabled={field.disabled}
                        value={field.value}
                      >
                        <SelectTrigger
                          className="w-full"
                          id="gitlab-selectedsourceenvironment"
                          isError={Boolean(error)}
                          aria-describedby={
                            error ? "gitlab-selectedsourceenvironment-error" : undefined
                          }
                          ref={field.ref}
                          onBlur={field.onBlur}
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
                      {Boolean(error) && (
                        <FieldError id="gitlab-selectedsourceenvironment-error">
                          {error?.message}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  defaultValue=""
                  name="secretPath"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="mb-4" data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="gitlab-secretpath">Secrets Path</FieldLabel>
                      <SecretPathInput
                        {...field}
                        placeholder="/"
                        environment={selectedSourceEnvironment}
                        id="gitlab-secretpath"
                        isError={Boolean(error)}
                        aria-describedby={error ? "gitlab-secretpath-error" : undefined}
                      />
                      {Boolean(error) && (
                        <FieldError id="gitlab-secretpath-error">{error?.message}</FieldError>
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="targetEntity"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <Field className="mb-4" data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="gitlab-targetentity">GitLab Integration Type</FieldLabel>
                      <Select
                        onValueChange={(e) => onChange(e)}
                        name={field.name}
                        disabled={field.disabled}
                        value={field.value}
                      >
                        <SelectTrigger
                          className="w-full"
                          id="gitlab-targetentity"
                          isError={Boolean(error)}
                          aria-describedby={error ? "gitlab-targetentity-error" : undefined}
                          ref={field.ref}
                          onBlur={field.onBlur}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {gitLabEntities.map((entity) => {
                            return (
                              <SelectItem
                                value={entity.value}
                                key={`target-entity-${entity.value}`}
                              >
                                {entity.name}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {Boolean(error) && (
                        <FieldError id="gitlab-targetentity-error">{error?.message}</FieldError>
                      )}
                    </Field>
                  )}
                />
                {targetEntity === "group" && targetTeamId && (
                  <Controller
                    control={control}
                    name="targetTeamId"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <Field className="mb-4" data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="gitlab-targetteamid">GitLab Group</FieldLabel>
                        <Select
                          onValueChange={(e) => onChange(e)}
                          name={field.name}
                          disabled={field.disabled}
                          value={field.value}
                        >
                          <SelectTrigger
                            className="w-full"
                            id="gitlab-targetteamid"
                            isError={Boolean(error)}
                            aria-describedby={error ? "gitlab-targetteamid-error" : undefined}
                            ref={field.ref}
                            onBlur={field.onBlur}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {integrationAuthTeams.length > 0 ? (
                              integrationAuthTeams.map((integrationAuthTeam) => (
                                <SelectItem
                                  value={String(integrationAuthTeam.id as string)}
                                  key={`target-team-${String(integrationAuthTeam.id)}`}
                                >
                                  {integrationAuthTeam.name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="none" key="target-team-none">
                                No groups found
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {Boolean(error) && (
                          <FieldError id="gitlab-targetteamid-error">{error?.message}</FieldError>
                        )}
                      </Field>
                    )}
                  />
                )}
                <Controller
                  control={control}
                  name="targetAppId"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => {
                    return (
                      <Field className="mb-4" data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="gitlab-targetappid">GitLab Project</FieldLabel>
                        <Select
                          onValueChange={(e) => {
                            if (e === "") return;
                            onChange(e);
                          }}
                          name={field.name}
                          disabled={field.disabled}
                          value={field.value}
                        >
                          <SelectTrigger
                            className="w-full"
                            id="gitlab-targetappid"
                            isError={Boolean(error)}
                            aria-describedby={error ? "gitlab-targetappid-error" : undefined}
                            ref={field.ref}
                            onBlur={field.onBlur}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {integrationAuthApps.length > 0 ? (
                              integrationAuthApps.map((integrationAuthApp) => (
                                <SelectItem
                                  value={String(integrationAuthApp.appId as string)}
                                  key={`target-app-${String(integrationAuthApp.appId)}`}
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
                        {Boolean(error) && (
                          <FieldError id="gitlab-targetappid-error">{error?.message}</FieldError>
                        )}
                      </Field>
                    );
                  }}
                />
                <Controller
                  control={control}
                  defaultValue=""
                  name="targetEnvironment"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="mb-4" data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="gitlab-targetenvironment">
                        GitLab Environment Scope (Optional)
                      </FieldLabel>
                      <Input
                        {...field}
                        placeholder="*"
                        id="gitlab-targetenvironment"
                        isError={Boolean(error)}
                        aria-describedby={error ? "gitlab-targetenvironment-error" : undefined}
                      />
                      {Boolean(error) && (
                        <FieldError id="gitlab-targetenvironment-error">
                          {error?.message}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="initialSyncBehavior"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <Field className="mb-4" data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="gitlab-initialsyncbehavior">
                        Initial Sync Behavior
                      </FieldLabel>
                      <Select defaultValue={field.value} onValueChange={(e) => onChange(e)}>
                        <SelectTrigger
                          className="w-full"
                          id="gitlab-initialsyncbehavior"
                          isError={Boolean(error)}
                          aria-describedby={error ? "gitlab-initialsyncbehavior-error" : undefined}
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
                      {Boolean(error) && (
                        <FieldError id="gitlab-initialsyncbehavior-error">
                          {error?.message}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
              </motion.div>
            </TabsContent>
            <TabsContent value={TabSections.Options}>
              <motion.div
                key="panel-1"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: -30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
                className="pb-57"
              >
                <div className="ml-1">
                  <Controller
                    control={control}
                    name="shouldMaskSecrets"
                    render={({ field: { onChange, value } }) => (
                      <Field orientation="horizontal">
                        <FieldLabel htmlFor="should-mask-secrets">
                          <div className="max-w-md">
                            Mark Infisical secrets in Gitlab as &apos;Masked&apos; secrets
                          </div>
                        </FieldLabel>
                        <Toggle
                          id="should-mask-secrets"
                          onCheckedChange={(isChecked) => onChange(isChecked)}
                          checked={value}
                          variant="project"
                        />
                      </Field>
                    )}
                  />
                </div>
                <div className="mt-4 mb-5 ml-1">
                  <Controller
                    control={control}
                    name="shouldProtectSecrets"
                    render={({ field: { onChange, value } }) => (
                      <Field orientation="horizontal">
                        <FieldLabel htmlFor="should-protect-secrets">
                          Mark Infisical secrets in Gitlab as &apos;Protected&apos; secrets
                        </FieldLabel>
                        <Toggle
                          id="should-protect-secrets"
                          onCheckedChange={(isChecked) => onChange(isChecked)}
                          checked={value}
                          variant="project"
                        />
                      </Field>
                    )}
                  />
                </div>
                <Controller
                  control={control}
                  name="secretPrefix"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="mb-4" data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="gitlab-secretprefix">Secret Prefix</FieldLabel>
                      <Input
                        {...field}
                        placeholder="INFISICAL_"
                        id="gitlab-secretprefix"
                        isError={Boolean(error)}
                        aria-describedby={error ? "gitlab-secretprefix-error" : undefined}
                      />
                      {Boolean(error) && (
                        <FieldError id="gitlab-secretprefix-error">{error?.message}</FieldError>
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="secretSuffix"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="mb-4" data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="gitlab-secretsuffix">Secret Suffix</FieldLabel>
                      <Input
                        {...field}
                        placeholder="_INFISICAL"
                        id="gitlab-secretsuffix"
                        isError={Boolean(error)}
                        aria-describedby={error ? "gitlab-secretsuffix-error" : undefined}
                      />
                      {Boolean(error) && (
                        <FieldError id="gitlab-secretsuffix-error">{error?.message}</FieldError>
                      )}
                    </Field>
                  )}
                />
              </motion.div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            size="sm"
            type="submit"
            isPending={isLoading}
            isDisabled={targetAppIdValue === "none"}
            variant="project"
          >
            Create Integration
          </Button>
        </CardFooter>
      </Card>
      <Dialog
        open={popUp.confirmIntegration?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("confirmIntegration", isOpen)}
      >
        <DialogContent isPending={isLoading}>
          <DialogHeader>
            <DialogTitle>Heads Up</DialogTitle>
            <DialogDescription asChild>
              <div>
                <p>You&apos;re about to overwrite any existing secrets in GitLab.</p>
                <p className="mt-4">
                  To avoid this behavior, you may consider adding a secret prefix/suffix in the
                  options tab.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => onFormSubmit(popUp.confirmIntegration?.data as FormData)}
              variant="project"
              isPending={isLoading}
            >
              Continue Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up GitLab Integration" />
      {isIntegrationAuthAppsLoading || isintegrationAuthTeamsLoading ? (
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
