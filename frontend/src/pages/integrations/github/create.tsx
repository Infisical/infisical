import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  faAngleDown,
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCheckCircle,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import axios from "axios";
import { motion } from "framer-motion";
import queryString from "query-string";
import { twMerge } from "tailwind-merge";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormControl,
  Input,
  Select,
  SelectItem,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
import {
  useCreateIntegration,
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthGithubEnvs,
  useGetIntegrationAuthGithubOrgs,
  useGetWorkspaceById
} from "@app/hooks/api";

enum TabSections {
  Connection = "connection",
  Options = "options"
}

const targetEnv = ["github-repo", "github-org", "github-env"] as const;
type TargetEnv = (typeof targetEnv)[number];

const schema = yup.object({
  selectedSourceEnvironment: yup.string().trim().required("Project Environment is required"),
  secretPath: yup.string().trim().required("Secrets Path is required"),
  secretSuffix: yup.string().trim().optional(),
  shouldEnableDelete: yup.boolean().optional(),
  scope: yup.mixed<TargetEnv>().oneOf(targetEnv.slice()).required(),

  repoIds: yup.mixed().when("scope", {
    is: "github-repo",
    then: yup.array(yup.string().required()).min(1, "Select at least one repositories")
  }),

  repoId: yup.mixed().when("scope", {
    is: "github-env",
    then: yup.string().required("Repository is required")
  }),

  repoName: yup.mixed().when("scope", {
    is: "github-env",
    then: yup.string().required("Repository is required")
  }),

  repoOwner: yup.mixed().when("scope", {
    is: "github-env",
    then: yup.string().required("Repository is required")
  }),

  envId: yup.mixed().when("scope", {
    is: "github-env",
    then: yup.string().required("Environment is required")
  }),

  orgId: yup.mixed().when("scope", {
    is: "github-org",
    then: yup.string().required("Organization is required")
  })
});

type FormData = yup.InferType<typeof schema>;

export default function GitHubCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const integrationAuthId =
    (queryString.parse(router.asPath.split("?")[1]).integrationAuthId as string) ?? "";

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById(integrationAuthId);

  const { data: integrationAuthApps, isLoading: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId
    });

  const { data: integrationAuthOrgs } = useGetIntegrationAuthGithubOrgs(
    integrationAuthId as string
  );

  const { control, handleSubmit, watch, setValue } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      secretPath: "/",
      scope: "github-repo",
      repoIds: [],
      shouldEnableDelete: false
    }
  });

  const scope = watch("scope");
  const repoId = watch("repoId");
  const repoIds = watch("repoIds");
  const repoName = watch("repoName");
  const repoOwner = watch("repoOwner");

  const { data: integrationAuthGithubEnvs } = useGetIntegrationAuthGithubEnvs(
    integrationAuthId as string,
    repoName,
    repoOwner
  );

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setValue("selectedSourceEnvironment", workspace.environments[0].slug);
    }
  }, [workspace]);

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

      setIsLoading(false);
      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);

      let errorMessage: string = "Something went wrong!";
      if (axios.isAxiosError(err)) {
        const { message } = err?.response?.data as { message: string };
        errorMessage = message;
      }

      createNotification({
        text: errorMessage,
        type: "error"
      });
      setIsLoading(false);
    }
  };

  return integrationAuth && workspace && integrationAuthApps ? (
    <div className="flex h-full w-full flex-col items-center justify-center py-4">
      <Head>
        <title>Set Up GitHub Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <form onSubmit={handleSubmit(onFormSubmit)} className="px-6">
          <CardTitle
            className="px-0 text-left text-xl"
            subTitle="Choose which environment in Infisical you want to sync to environment variables in GitHub."
          >
            <div className="flex flex-row items-center">
              <div className="flex items-center rounded-full bg-mineshaft-200">
                <Image
                  src="/images/integrations/GitHub.png"
                  height={30}
                  width={30}
                  alt="GitHub logo"
                />
              </div>
              <span className="ml-2.5">GitHub Integration </span>
              <Link href="https://infisical.com/docs/integrations/cicd/githubactions" passHref>
                <a target="_blank" rel="noopener noreferrer">
                  <div className="ml-2 mb-1 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                    <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                    Docs
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="ml-1.5 mb-[0.07rem] text-xxs"
                    />
                  </div>
                </a>
              </Link>
            </div>
          </CardTitle>
          <Tabs defaultValue={TabSections.Connection}>
            <TabList>
              <div className="flex w-full flex-row border-b border-mineshaft-600">
                <Tab value={TabSections.Connection}>Connection</Tab>
                <Tab value={TabSections.Options}>Options</Tab>
              </div>
            </TabList>
            <TabPanel value={TabSections.Connection}>
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
                    <FormControl
                      label="Project Environment"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Select
                        defaultValue={field.value}
                        onValueChange={onChange}
                        className="w-full border border-mineshaft-500"
                      >
                        {workspace?.environments.map((sourceEnvironment) => (
                          <SelectItem
                            value={sourceEnvironment.slug}
                            key={`source-environment-${sourceEnvironment.slug}`}
                          >
                            {sourceEnvironment.name}
                          </SelectItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="secretPath"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Secrets Path"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input {...field} placeholder="Provide a path, default is /" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="scope"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl label="Scope" errorText={error?.message} isError={Boolean(error)}>
                      <Select
                        defaultValue={field.value}
                        onValueChange={onChange}
                        className="w-full border border-mineshaft-500"
                      >
                        <SelectItem value="github-org">Organization</SelectItem>
                        <SelectItem value="github-repo">Repository</SelectItem>
                        <SelectItem value="github-env">Repository Environment</SelectItem>
                      </Select>
                    </FormControl>
                  )}
                />
                {scope === "github-repo" && (
                  <Controller
                    control={control}
                    name="repoIds"
                    render={({ field: { onChange }, fieldState: { error } }) => (
                      <FormControl
                        label="Repositories"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            {integrationAuthApps.length > 0 ? (
                              <div className="inline-flex w-full cursor-pointer items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none data-[placeholder]:text-mineshaft-200">
                                {repoIds.length === 1
                                  ? integrationAuthApps?.reduce(
                                      (acc, { appId, name, owner }) =>
                                        repoIds[0] === appId ? `${owner}/${name}` : acc,
                                      ""
                                    )
                                  : `${repoIds.length} repositories selected`}
                                <FontAwesomeIcon icon={faAngleDown} className="text-xs" />
                              </div>
                            ) : (
                              <div className="inline-flex w-full cursor-default items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none data-[placeholder]:text-mineshaft-200">
                                No repositories found
                              </div>
                            )}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            className="thin-scrollbar z-[100] max-h-80 overflow-y-scroll"
                          >
                            {integrationAuthApps.length > 0 ? (
                              integrationAuthApps.map((integrationAuthApp) => {
                                const isSelected = repoIds.includes(
                                  String(integrationAuthApp.appId)
                                );

                                return (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (repoIds.includes(String(integrationAuthApp.appId))) {
                                        onChange(
                                          repoIds.filter(
                                            (appId: string) =>
                                              appId !== String(integrationAuthApp.appId)
                                          )
                                        );
                                      } else {
                                        onChange([...repoIds, String(integrationAuthApp.appId)]);
                                      }
                                    }}
                                    key={`repos-id-${integrationAuthApp.appId}`}
                                    icon={
                                      isSelected ? (
                                        <FontAwesomeIcon
                                          icon={faCheckCircle}
                                          className="pr-0.5 text-primary"
                                        />
                                      ) : (
                                        <div className="pl-[1.01rem]" />
                                      )
                                    }
                                    iconPos="left"
                                    className="w-[28.4rem] text-sm"
                                  >
                                    {integrationAuthApp.owner}/{integrationAuthApp.name}
                                  </DropdownMenuItem>
                                );
                              })
                            ) : (
                              <div />
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </FormControl>
                    )}
                  />
                )}
                {scope === "github-org" && (
                  <Controller
                    control={control}
                    name="orgId"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        label="Organization"
                        errorText={
                          integrationAuthOrgs?.length ? error?.message : "No organizations found"
                        }
                        isError={Boolean(integrationAuthOrgs?.length && error?.message)}
                      >
                        <Select
                          value={field.value}
                          onValueChange={onChange}
                          className="w-full border border-mineshaft-500"
                        >
                          {integrationAuthOrgs &&
                            integrationAuthOrgs.map(({ name, orgId }) => (
                              <SelectItem key={`github-organization-${orgId}`} value={orgId}>
                                {name}
                              </SelectItem>
                            ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                )}
                {scope === "github-env" && (
                  <Controller
                    control={control}
                    name="repoId"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        label="Repository"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Select
                          value={field.value}
                          onValueChange={(e) => {
                            const selectedRepo = integrationAuthApps.find((app) => app.appId === e);
                            setValue("repoName", selectedRepo?.name);
                            setValue("repoOwner", selectedRepo?.owner);
                            onChange(e);
                          }}
                          className="w-full border border-mineshaft-500"
                        >
                          {integrationAuthApps?.length ? (
                            integrationAuthApps.map((app) => {
                              return (
                                <SelectItem
                                  value={app.appId as string}
                                  key={`repo-id-${app.appId}`}
                                  className="w-[28.4rem] text-sm"
                                >
                                  {app.owner}/{app.name}
                                </SelectItem>
                              );
                            })
                          ) : (
                            <div />
                          )}
                        </Select>
                      </FormControl>
                    )}
                  />
                )}
                {scope === "github-env" && (
                  <Controller
                    control={control}
                    name="envId"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        label="Environment"
                        errorText={
                          integrationAuthGithubEnvs?.length
                            ? error?.message
                            : "No Environment found"
                        }
                        isError={Boolean(integrationAuthGithubEnvs?.length || error?.message)}
                      >
                        <Select
                          value={field.value}
                          onValueChange={onChange}
                          isDisabled={!repoId}
                          className={twMerge(
                            "w-full border border-mineshaft-500",
                            !repoId && "h-10 cursor-not-allowed"
                          )}
                        >
                          {integrationAuthGithubEnvs?.length ? (
                            integrationAuthGithubEnvs.map((githubEnv) => {
                              return (
                                <SelectItem
                                  value={githubEnv.name as string}
                                  key={`env-id-${githubEnv.envId}`}
                                  className="w-[28.4rem] text-sm"
                                >
                                  {githubEnv.name}
                                </SelectItem>
                              );
                            })
                          ) : (
                            <div />
                          )}
                        </Select>
                      </FormControl>
                    )}
                  />
                )}
              </motion.div>
            </TabPanel>
            <TabPanel value={TabSections.Options}>
              <motion.div
                key="panel-1"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: -30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
              >
                <div className="ml-1 mb-5">
                  <Controller
                    control={control}
                    name="shouldEnableDelete"
                    render={({ field: { onChange, value } }) => (
                      <Switch
                        id="delete-github-option"
                        onCheckedChange={(isChecked) => onChange(isChecked)}
                        isChecked={value}
                      >
                        Delete secrets in Github that are not in Infisical
                      </Switch>
                    )}
                  />
                </div>
                <Controller
                  control={control}
                  name="secretSuffix"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Append Secret Names with..."
                      className="pb-[9.75rem]"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input
                        {...field}
                        placeholder="Provide a suffix for secret names, default is no suffix"
                      />
                    </FormControl>
                  )}
                />
              </motion.div>
            </TabPanel>
          </Tabs>
          <div className="flex w-full justify-end">
            <Button
              type="submit"
              color="mineshaft"
              variant="outline_bg"
              className="mb-6"
              isLoading={isLoading}
            >
              Create Integration
            </Button>
          </div>
        </form>
      </Card>
      <div className="mt-6 w-full max-w-md border-t border-mineshaft-800" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-mineshaft-200" />{" "}
          <span className="text-md ml-3 text-mineshaft-100">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-mineshaft-300">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in GitHub with secrets from Infisical.
        </span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Set Up GitHub Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      {isIntegrationAuthAppsLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 text-center text-mineshaft-200">
          <FontAwesomeIcon icon={faBugs} className="li my-2 inline text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-mineshaft-100 underline decoration-primary-500 underline-offset-4 opacity-80 duration-200 hover:opacity-100"
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
}

GitHubCreateIntegrationPage.requireAuth = true;
