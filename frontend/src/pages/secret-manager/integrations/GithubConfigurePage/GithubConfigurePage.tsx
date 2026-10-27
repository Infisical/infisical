import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  faAngleDown,
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCheckCircle,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "motion/react";
import { z, ZodIssueCode } from "zod";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldError,
  FieldLabel,
  Input,
  ProviderIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import {
  useCreateIntegration,
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthGithubEnvs,
  useGetIntegrationAuthGithubOrgs
} from "@app/hooks/api";
import { IntegrationsListPageTabs } from "@app/types/integrations";

enum TabSections {
  Connection = "connection",
  Options = "options"
}

const secretsVisibility = [
  {
    value: "selected",
    label: "Select repositories"
  },
  {
    value: "all",
    label: "All public repositories"
  },
  {
    value: "private",
    label: "All private repositories"
  }
] as const;

const targetEnv = ["github-repo", "github-org", "github-env"] as const;

const schema = z
  .object({
    selectedSourceEnvironment: z.string().trim(),
    secretPath: z.string().trim(),
    secretSuffix: z.string().trim().optional(),
    shouldEnableDelete: z.boolean().optional(),
    scope: z.enum(targetEnv),

    // Explanation: If scope is (github-repo) OR (github-org AND visibility is set to selected), then repoIds is required
    repoId: z.string().optional(),
    repoIds: z.string().array().optional(),
    repoName: z.string().optional(),
    repoOwner: z.string().optional(),
    envId: z.string().optional(),
    orgId: z.string().optional(),
    visibility: z.string().optional()
  })
  .superRefine((data, ctx) => {
    if (data.scope === "github-env") {
      if (!data.repoId) {
        ctx.addIssue({
          code: ZodIssueCode.custom,
          path: ["repoId"],
          message: "Repository is required"
        });
      }
      if (!data.repoName) {
        ctx.addIssue({
          code: ZodIssueCode.custom,
          path: ["repoName"],
          message: "Repository is required"
        });
      }
      if (!data.repoOwner) {
        ctx.addIssue({
          code: ZodIssueCode.custom,
          path: ["repoOwner"],
          message: "Repository is required"
        });
      }
      if (!data.envId) {
        ctx.addIssue({
          code: ZodIssueCode.custom,
          path: ["envId"],
          message: "Environment is required"
        });
      }
    }

    if (data.scope === "github-org") {
      if (!data.orgId) {
        ctx.addIssue({
          code: ZodIssueCode.custom,
          path: ["orgId"],
          message: "Organization is required"
        });
      }
      if (!data.visibility) {
        ctx.addIssue({
          code: ZodIssueCode.custom,
          path: ["visibility"],
          message: "Visibility is required"
        });
      }
    }
  });

type FormData = z.infer<typeof schema>;

export const GithubConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.GithubConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { data: integrationAuth } = useGetIntegrationAuthById(integrationAuthId);

  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId
    });

  const { data: integrationAuthOrgs } = useGetIntegrationAuthGithubOrgs(
    integrationAuthId as string
  );

  const { control, handleSubmit, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      secretPath: "/",
      scope: "github-repo",
      repoIds: [],
      visibility: "all",
      shouldEnableDelete: false,
      selectedSourceEnvironment: currentProject.environments[0].slug
    }
  });

  const scope = watch("scope");
  const repoId = watch("repoId");
  const repoIds = watch("repoIds") || [];
  const repoName = watch("repoName");
  const repoOwner = watch("repoOwner");
  const selectedOrgId = watch("orgId");

  const { data: integrationAuthGithubEnvs } = useGetIntegrationAuthGithubEnvs(
    integrationAuthId as string,
    repoName || "",
    repoOwner || ""
  );

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (integrationAuthGithubEnvs && integrationAuthGithubEnvs?.length > 0) {
      setValue("envId", integrationAuthGithubEnvs[0].envId);
    } else {
      setValue("envId", undefined);
    }
  }, [integrationAuthGithubEnvs]);

  const onFormSubmit = async (data: FormData) => {
    try {
      setIsLoading(true);

      if (!integrationAuth?.id) return;

      switch (data.scope) {
        case "github-repo": {
          const targetApps = integrationAuthApps?.filter((integrationAuthApp) =>
            data.repoIds?.includes(String(integrationAuthApp.appId))
          );

          if (!targetApps) return;

          await Promise.all(
            targetApps.map(async (targetApp) => {
              await mutateAsync({
                integrationAuthId: integrationAuth?.id,
                isActive: true,
                scope: data.scope,
                secretPath: data.secretPath,
                sourceEnvironment: data.selectedSourceEnvironment,
                app: targetApp.name, // repo name
                owner: targetApp.owner, // repo owner
                metadata: {
                  secretSuffix: data.secretSuffix,
                  shouldEnableDelete: data.shouldEnableDelete
                }
              });
            })
          );

          break;
        }
        case "github-org":
          await mutateAsync({
            integrationAuthId: integrationAuth?.id,
            isActive: true,
            secretPath: data.secretPath,
            sourceEnvironment: data.selectedSourceEnvironment,
            scope: data.scope,
            owner: integrationAuthOrgs?.find((e) => e.orgId === data.orgId)?.name,
            metadata: {
              githubVisibility: data.visibility,
              githubVisibilityRepoIds: data.repoIds,
              secretSuffix: data.secretSuffix,
              shouldEnableDelete: data.shouldEnableDelete
            }
          });
          break;

        case "github-env":
          await mutateAsync({
            integrationAuthId: integrationAuth?.id,
            isActive: true,
            secretPath: data.secretPath,
            sourceEnvironment: data.selectedSourceEnvironment,
            scope: data.scope,
            app: repoName,
            appId: data.repoId,
            owner: repoOwner,
            targetEnvironmentId: data.envId,
            metadata: {
              secretSuffix: data.secretSuffix,
              shouldEnableDelete: data.shouldEnableDelete
            }
          });
          break;
        default:
          throw new Error("Invalid scope");
      }

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
      return;
    } finally {
      setIsLoading(false);
    }
  };

  const selectedOrganization = useMemo(() => {
    if (!integrationAuthApps) return null;

    return integrationAuthApps.filter(
      (authApp) =>
        integrationAuthOrgs?.find((e) => e.orgId === selectedOrgId)?.name === authApp.owner
    );
  }, [selectedOrgId, integrationAuthApps]);

  return integrationAuth && integrationAuthApps ? (
    <div className="flex h-full w-full flex-col items-center justify-center py-4">
      <PageTitle title="Set Up GitHub Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <ProviderIcon icon="GitHub.png" height={30} width={30} alt="GitHub logo" />
            <span>GitHub Integration</span>
          </CardTitle>
          <CardDescription>
            Choose which environment in Infisical you want to sync to environment variables in
            GitHub.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/docs/integrations/cicd/githubactions"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit(onFormSubmit)}>
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
                        <FieldLabel htmlFor="github-selectedsourceenvironment">
                          Project Environment
                        </FieldLabel>
                        <Select defaultValue={field.value} onValueChange={onChange}>
                          <SelectTrigger
                            className="w-full"
                            id="github-selectedsourceenvironment"
                            isError={Boolean(error)}
                            aria-describedby={
                              error ? "github-selectedsourceenvironment-error" : undefined
                            }
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
                          <FieldError id="github-selectedsourceenvironment-error">
                            {error?.message}
                          </FieldError>
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="secretPath"
                    render={({ field, fieldState: { error } }) => (
                      <Field className="mb-4" data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="github-secretpath">Secrets Path</FieldLabel>
                        <Input
                          {...field}
                          placeholder="Provide a path, default is /"
                          id="github-secretpath"
                          isError={Boolean(error)}
                          aria-describedby={error ? "github-secretpath-error" : undefined}
                        />
                        {Boolean(error) && (
                          <FieldError id="github-secretpath-error">{error?.message}</FieldError>
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="scope"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <Field className="mb-4" data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="github-scope">Scope</FieldLabel>
                        <Select
                          defaultValue={field.value}
                          onValueChange={(e) => {
                            setValue("repoIds", []);
                            onChange(e);
                          }}
                        >
                          <SelectTrigger
                            className="w-full"
                            id="github-scope"
                            isError={Boolean(error)}
                            aria-describedby={error ? "github-scope-error" : undefined}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="github-org">Organization</SelectItem>
                            <SelectItem value="github-repo">Repository</SelectItem>
                            <SelectItem value="github-env">Repository Environment</SelectItem>
                          </SelectContent>
                        </Select>
                        {Boolean(error) && (
                          <FieldError id="github-scope-error">{error?.message}</FieldError>
                        )}
                      </Field>
                    )}
                  />
                  {scope === "github-repo" && (
                    <Controller
                      control={control}
                      name="repoIds"
                      render={({ field: { onChange }, fieldState: { error } }) => (
                        <Field className="mb-4" data-invalid={Boolean(error?.message)}>
                          <FieldLabel htmlFor="github-repoids">Repositories</FieldLabel>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              {integrationAuthApps.length > 0 ? (
                                <Button
                                  variant="outline"
                                  className="w-full justify-between"
                                  id="github-repoids"
                                  aria-invalid={Boolean(error?.message)}
                                  aria-describedby={
                                    error?.message ? "github-repoids-error" : undefined
                                  }
                                >
                                  {repoIds?.length === 1
                                    ? integrationAuthApps?.reduce(
                                        (acc, { appId, name, owner }) =>
                                          repoIds?.[0] === appId ? `${owner}/${name}` : acc,
                                        ""
                                      )
                                    : `${repoIds?.length} repositories selected`}
                                  <FontAwesomeIcon icon={faAngleDown} className="text-xs" />
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  className="w-full justify-between"
                                  id="github-repoids"
                                  aria-invalid={Boolean(error?.message)}
                                  aria-describedby={
                                    error?.message ? "github-repoids-error" : undefined
                                  }
                                >
                                  No repositories found
                                </Button>
                              )}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="start"
                              className="min-w-(--radix-dropdown-menu-trigger-width)"
                            >
                              {integrationAuthApps.length > 0 ? (
                                integrationAuthApps.map((integrationAuthApp) => {
                                  const isSelected = repoIds?.includes(
                                    String(integrationAuthApp.appId)
                                  );

                                  return (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (repoIds?.includes(String(integrationAuthApp.appId))) {
                                          onChange(
                                            repoIds.filter(
                                              (appId: string) =>
                                                appId !== String(integrationAuthApp.appId)
                                            )
                                          );
                                        } else {
                                          onChange([
                                            ...(repoIds || []),
                                            String(integrationAuthApp.appId)
                                          ]);
                                        }
                                      }}
                                      key={`repos-id-${integrationAuthApp.appId}`}
                                    >
                                      {isSelected ? (
                                        <FontAwesomeIcon
                                          icon={faCheckCircle}
                                          className="pr-0.5 text-project"
                                        />
                                      ) : (
                                        <div className="pl-[1.01rem]" />
                                      )}
                                      {integrationAuthApp.owner}/{integrationAuthApp.name}
                                    </DropdownMenuItem>
                                  );
                                })
                              ) : (
                                <div />
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {Boolean(error?.message) && (
                            <FieldError id="github-repoids-error">{error?.message}</FieldError>
                          )}
                        </Field>
                      )}
                    />
                  )}
                  {scope === "github-org" && (
                    <>
                      <Controller
                        control={control}
                        name="orgId"
                        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                          <Field className="mb-4" data-invalid={Boolean(error?.message)}>
                            <FieldLabel htmlFor="github-orgid">Organization</FieldLabel>
                            <Select value={field.value} onValueChange={onChange}>
                              <SelectTrigger
                                className="w-full"
                                id="github-orgid"
                                isError={Boolean(error?.message)}
                                aria-describedby={error?.message ? "github-orgid-error" : undefined}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {integrationAuthOrgs &&
                                  integrationAuthOrgs.map(({ name, orgId }) => (
                                    <SelectItem key={`github-organization-${orgId}`} value={orgId}>
                                      {name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            {Boolean(error?.message) && (
                              <FieldError id="github-orgid-error">
                                {integrationAuthOrgs?.length
                                  ? error?.message
                                  : "No organizations found"}
                              </FieldError>
                            )}
                          </Field>
                        )}
                      />

                      <Controller
                        control={control}
                        name="visibility"
                        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                          <Field className="mb-4" data-invalid={Boolean(error?.message)}>
                            <FieldLabel htmlFor="github-visibility">
                              Visibility
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" aria-label="More information">
                                    ?
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Select which type of repositories that the secrets should be
                                  synced to.
                                </TooltipContent>
                              </Tooltip>
                            </FieldLabel>
                            <Select value={field.value} onValueChange={onChange}>
                              <SelectTrigger
                                className="w-full"
                                id="github-visibility"
                                isError={Boolean(error?.message)}
                                aria-describedby={
                                  error?.message ? "github-visibility-error" : undefined
                                }
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {secretsVisibility.map(({ label, value }) => (
                                  <SelectItem key={`github-visibility-${value}`} value={value}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {Boolean(error?.message) && (
                              <FieldError id="github-visibility-error">{error?.message}</FieldError>
                            )}
                          </Field>
                        )}
                      />

                      {watch("visibility") === "selected" && (
                        <Controller
                          control={control}
                          name="repoIds"
                          render={({ field: { onChange }, fieldState: { error } }) => (
                            <Field className="mb-4" data-invalid={Boolean(error?.message)}>
                              <FieldLabel htmlFor="github-repoids">
                                Selected Repositories
                              </FieldLabel>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  {integrationAuthApps.length > 0 ? (
                                    <Button
                                      variant="outline"
                                      className="w-full justify-between"
                                      id="github-repoids"
                                      aria-invalid={Boolean(error?.message)}
                                      aria-describedby={
                                        error?.message ? "github-repoids-error" : undefined
                                      }
                                    >
                                      {repoIds?.length === 1
                                        ? integrationAuthApps?.reduce(
                                            (acc, { appId, name, owner }) =>
                                              repoIds?.[0] === appId ? `${owner}/${name}` : acc,
                                            ""
                                          )
                                        : `${repoIds?.length} repositories selected`}
                                      <FontAwesomeIcon icon={faAngleDown} className="text-xs" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      className="w-full justify-between"
                                      id="github-repoids"
                                      aria-invalid={Boolean(error?.message)}
                                      aria-describedby={
                                        error?.message ? "github-repoids-error" : undefined
                                      }
                                    >
                                      No repositories found
                                    </Button>
                                  )}
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="start"
                                  className="min-w-(--radix-dropdown-menu-trigger-width)"
                                >
                                  {selectedOrganization ? (
                                    selectedOrganization.map((integrationAuthApp) => {
                                      const isSelected = repoIds?.includes(
                                        String(integrationAuthApp.appId)
                                      );

                                      return (
                                        <DropdownMenuItem
                                          onClick={() => {
                                            if (
                                              repoIds?.includes(String(integrationAuthApp.appId))
                                            ) {
                                              onChange(
                                                repoIds?.filter(
                                                  (appId: string) =>
                                                    appId !== String(integrationAuthApp.appId)
                                                )
                                              );
                                            } else {
                                              onChange([
                                                ...repoIds,
                                                String(integrationAuthApp.appId)
                                              ]);
                                            }
                                          }}
                                          key={`repos-id-${integrationAuthApp.appId}`}
                                        >
                                          {isSelected ? (
                                            <FontAwesomeIcon
                                              icon={faCheckCircle}
                                              className="pr-0.5 text-project"
                                            />
                                          ) : (
                                            <div className="pl-[1.01rem]" />
                                          )}
                                          {integrationAuthApp.owner}/{integrationAuthApp.name}
                                        </DropdownMenuItem>
                                      );
                                    })
                                  ) : (
                                    <div />
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              {Boolean(error?.message) && (
                                <FieldError id="github-repoids-error">{error?.message}</FieldError>
                              )}
                            </Field>
                          )}
                        />
                      )}
                    </>
                  )}
                  {scope === "github-env" && (
                    <Controller
                      control={control}
                      name="repoId"
                      render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                        <Field className="mb-4" data-invalid={Boolean(error)}>
                          <FieldLabel htmlFor="github-repoid">Repository</FieldLabel>
                          <Select
                            value={field.value}
                            onValueChange={(e) => {
                              const selectedRepo = integrationAuthApps.find(
                                (app) => app.appId === e
                              );
                              setValue("repoName", selectedRepo?.name);
                              setValue("repoOwner", selectedRepo?.owner);
                              onChange(e);
                            }}
                          >
                            <SelectTrigger
                              className="w-full"
                              id="github-repoid"
                              isError={Boolean(error)}
                              aria-describedby={error ? "github-repoid-error" : undefined}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {integrationAuthApps?.length ? (
                                integrationAuthApps.map((app) => {
                                  return (
                                    <SelectItem
                                      value={app.appId as string}
                                      key={`repo-id-${app.appId}`}
                                    >
                                      {app.owner}/{app.name}
                                    </SelectItem>
                                  );
                                })
                              ) : (
                                <div />
                              )}
                            </SelectContent>
                          </Select>
                          {Boolean(error) && (
                            <FieldError id="github-repoid-error">{error?.message}</FieldError>
                          )}
                        </Field>
                      )}
                    />
                  )}
                  {scope === "github-env" && (
                    <Controller
                      control={control}
                      name="envId"
                      render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                        <Field className="mb-4" data-invalid={Boolean(error?.message)}>
                          <FieldLabel htmlFor="github-envid">Environment</FieldLabel>
                          <Select value={field.value} onValueChange={onChange} disabled={!repoId}>
                            <SelectTrigger
                              className="w-full"
                              id="github-envid"
                              isError={Boolean(error?.message)}
                              aria-describedby={error?.message ? "github-envid-error" : undefined}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {integrationAuthGithubEnvs?.length ? (
                                integrationAuthGithubEnvs.map((githubEnv) => {
                                  return (
                                    <SelectItem
                                      value={githubEnv.name as string}
                                      key={`env-id-${githubEnv.envId}`}
                                    >
                                      {githubEnv.name}
                                    </SelectItem>
                                  );
                                })
                              ) : (
                                <div />
                              )}
                            </SelectContent>
                          </Select>
                          {Boolean(error?.message) && (
                            <FieldError id="github-envid-error">
                              {integrationAuthGithubEnvs?.length
                                ? error?.message
                                : "No Environment found"}
                            </FieldError>
                          )}
                        </Field>
                      )}
                    />
                  )}
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
                  <div className="mb-5 ml-1">
                    <Controller
                      control={control}
                      name="shouldEnableDelete"
                      render={({ field: { onChange, value } }) => (
                        <Field orientation="horizontal">
                          <FieldLabel htmlFor="delete-github-option">
                            Delete secrets in Github that are not in Infisical
                          </FieldLabel>
                          <Toggle
                            id="delete-github-option"
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
                    name="secretSuffix"
                    render={({ field, fieldState: { error } }) => (
                      <Field className="mb-4" data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="github-secretsuffix">
                          Append Secret Names with...
                        </FieldLabel>
                        <Input
                          {...field}
                          placeholder="Provide a suffix for secret names, default is no suffix"
                          id="github-secretsuffix"
                          isError={Boolean(error)}
                          aria-describedby={error ? "github-secretsuffix-error" : undefined}
                        />
                        {Boolean(error) && (
                          <FieldError id="github-secretsuffix-error">{error?.message}</FieldError>
                        )}
                      </Field>
                    )}
                  />
                </motion.div>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" isPending={isLoading} variant="project">
              Create Integration
            </Button>
          </CardFooter>
        </form>
      </Card>
      <div className="mt-6 w-full max-w-md border-t border-border-faint" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-border-control bg-surface-raised p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-foreground-secondary" />{" "}
          <span className="text-md ml-3 text-foreground">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-label">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in GitHub with secrets from Infisical.
        </span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up GitHub Integration" />
      {isIntegrationAuthAppsLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-border-control bg-surface-raised p-6 text-center text-foreground-secondary">
          <FontAwesomeIcon icon={faBugs} className="li my-2 inline text-6xl" />
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
