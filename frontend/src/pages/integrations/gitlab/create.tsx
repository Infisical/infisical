import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { yupResolver } from "@hookform/resolvers/yup";
import { motion } from "framer-motion";
import queryString from "query-string";
import * as yup from "yup";

import {
  useCreateIntegration
} from "@app/hooks/api";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "../../../components/v2";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthTeams
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

const gitLabEntities = [
  { name: "Individual", value: "individual" },
  { name: "Group", value: "group" }
];

enum TabSections {
  Connection = "connection",
  Options = "options"
}

const schema = yup.object({
  targetEntity: yup.string().oneOf(gitLabEntities.map(entity => entity.value), "Invalid entity type"),
  targetTeamId: yup.string(),
  selectedSourceEnvironment: yup.string().required("Source environment is required"),
  secretPath: yup.string().required("Secret path is required"),
  targetAppId: yup.string().required("GitLab project is required"),
  targetEnvironment: yup.string(),
  secretPrefix: yup.string(),
  secretSuffix: yup.string()
});

type FormData = yup.InferType<typeof schema>;

export default function GitLabCreateIntegrationPage() {
  const router = useRouter();
  
  const {
    control,
    handleSubmit,
    setValue,
    watch
  } = useForm<FormData>({
      resolver: yupResolver(schema),
      defaultValues: {
        targetEntity: "individual",
        secretPath: "/"
      }
  });
  const selectedSourceEnvironment = watch("selectedSourceEnvironment");
  const targetEntity = watch("targetEntity");
  const targetTeamId = watch("targetTeamId");

  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? "",
    ...(targetTeamId ? { teamId: targetTeamId } : {})
  });
  const { data: integrationAuthTeams } = useGetIntegrationAuthTeams(
    (integrationAuthId as string) ?? ""
  );

  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    if (workspace) {
      setValue("selectedSourceEnvironment", workspace.environments[0].slug);
    }
  }, [workspace]);

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
          setValue("targetTeamId", String(integrationAuthTeams[0].teamId));
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
    secretSuffix
  }: FormData) => {
    try {
      setIsLoading(true);
      if (!integrationAuth?._id) return;
      
      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: integrationAuthApps?.find((integrationAuthApp) => String(integrationAuthApp.appId) === targetAppId)?.name,
        appId: String(targetAppId),
        sourceEnvironment: sse,
        targetEnvironment: targetEnvironment === "" ? "*" : targetEnvironment,
        secretPath,
        metadata: {
          secretPrefix,
          secretSuffix
        }
      });

      setIsLoading(false);
      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  }

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    integrationAuthTeams ? (
    <form 
      onSubmit={handleSubmit(onFormSubmit)}
      className="flex h-full w-full items-center justify-center"
    >
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">GitLab Integration</CardTitle>
        <Tabs defaultValue={TabSections.Connection}>
          <TabList>
            <Tab value={TabSections.Connection}>Connection</Tab>
            <Tab value={TabSections.Options}>Options</Tab>
          </TabList>
          <TabPanel value={TabSections.Connection}>
            <motion.div
                  key="panel-1"
                  transition={{ duration: 0.15 }}
                  initial={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: 30 }}
            >
              <div>
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
                        {...field}
                        onValueChange={(e) => onChange(e)}
                        className="w-full"
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
                    defaultValue=""
                    name="secretPath"
                    render={({ field, fieldState: { error } }) => (
                        <FormControl
                            label="Secrets Path"
                            isError={Boolean(error)}
                            errorText={error?.message}
                        >
                        <Input 
                            {...field} 
                            placeholder="/"
                        />
                        </FormControl>
                    )}
                />
                <Controller
                  control={control}
                  name="targetEntity"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl
                      label="GitLab Integration Type"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Select
                        {...field}
                        onValueChange={(e) => onChange(e)}
                        className="w-full"
                      >
                        {gitLabEntities.map((entity) => {
                          return (
                            <SelectItem value={entity.value} key={`target-entity-${entity.value}`}>
                              {entity.name}
                            </SelectItem>
                          );
                        })}
                      </Select>
                    </FormControl>
                  )}
                />
                {targetEntity === "group" && targetTeamId && (
                  <Controller
                    control={control}
                    name="targetTeamId"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        label="GitLab Group"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Select
                          {...field}
                          onValueChange={(e) => onChange(e)}
                          className="w-full"
                        >
                          {integrationAuthTeams.length > 0 ? (
                            integrationAuthTeams.map((integrationAuthTeam) => 
                            (
                              <SelectItem
                                value={String(integrationAuthTeam.teamId as string)}
                                key={`target-team-${String(integrationAuthTeam.teamId)}`}
                              >
                                {integrationAuthTeam.name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="none" key="target-team-none">
                              No groups found
                            </SelectItem>
                          )}
                        </Select>
                      </FormControl>
                    )}
                  />
                )}
                <Controller
                    control={control}
                    name="targetAppId"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => {
                    return (
                      <FormControl
                        label="GitLab Project"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Select
                          {...field}
                          onValueChange={(e) => {
                            if (e === "") return;
                            onChange(e)
                          }}
                          className="w-full"
                        >
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
                        </Select>
                      </FormControl>
                    )}}
                  />
                  <Controller
                    control={control}
                    defaultValue=""
                    name="targetEnvironment"
                    render={({ field, fieldState: { error } }) => (
                        <FormControl
                            label="GitLab Environment Scope (Optional)"
                            isError={Boolean(error)}
                            errorText={error?.message}
                        >
                        <Input 
                            {...field} 
                            placeholder="*"
                        />
                        </FormControl>
                    )}
                />
              </div>
              <Button
                className="mt-4"
                size="sm"
                type="submit"
                isLoading={isLoading}
              >
                Create Integration
              </Button>
            </motion.div>
          </TabPanel>
          <TabPanel value={TabSections.Options}>
            <div>
              <Controller
                control={control}
                name="secretPrefix"
                render={({ field, fieldState: { error } }) => (
                    <FormControl
                        label="Secret Prefix"
                        isError={Boolean(error)}
                        errorText={error?.message}
                    >
                    <Input 
                        {...field} 
                        placeholder="INFISICAL_"
                    />
                    </FormControl>
                )}
              />
              <Controller
                control={control}
                name="secretSuffix"
                render={({ field, fieldState: { error } }) => (
                    <FormControl
                        label="Secret Suffix"
                        isError={Boolean(error)}
                        errorText={error?.message}
                    >
                    <Input 
                        {...field} 
                        placeholder="_INFISICAL"
                    />
                    </FormControl>
                )}
              />
            </div>
          </TabPanel>
        </Tabs>
      </Card>
    </form>
  ) : (
    <div />
  );
}

GitLabCreateIntegrationPage.requireAuth = true;
