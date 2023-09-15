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
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "../../../components/v2";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

enum TabSections {
  Connection = "connection",
  Options = "options"
}

const schema = yup.object({
  selectedSourceEnvironment: yup.string().required("Source environment is required"),
  secretPath: yup.string().required("Secret path is required"),
  targetAppId: yup.string().required("GCP project is required"),
  secretPrefix: yup.string(),
  secretSuffix: yup.string(),
  shouldLabel: yup.boolean(),
  labelName: yup.string(),
  labelValue: yup.string()
});

type FormData = yup.InferType<typeof schema>;

export default function GCPSecretManagerCreateIntegrationPage() {
  const router = useRouter();
  const {
    control,
    handleSubmit,
    setValue,
    watch
  } = useForm<FormData>({
      resolver: yupResolver(schema),
      defaultValues: {
        secretPath: "/",
        shouldLabel: false,
        labelName: "managed-by",
        labelValue: "infisical"
      }
  });
  
  const shouldLabel = watch("shouldLabel");
  const selectedSourceEnvironment = watch("selectedSourceEnvironment");

  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    if (shouldLabel) {
      setValue("labelName", "managed-by");
      setValue("labelValue", "infisical");
      return;
    }
    
    setValue("labelName", undefined);
    setValue("labelValue", undefined);
  }, [shouldLabel]);

  useEffect(() => {
    if (workspace) {
      setValue("selectedSourceEnvironment", workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setValue("targetAppId", integrationAuthApps[0].appId as string);
      } else {
        setValue("targetAppId", "none");
      }
    }
  }, [integrationAuthApps]);
  
  const onFormSubmit = async ({
    selectedSourceEnvironment: sce,
    secretPath,
    targetAppId,
    secretPrefix,
    secretSuffix,
    shouldLabel: sl,
    labelName,
    labelValue
  }: FormData) => {
    try {
      setIsLoading(true);

      if (!integrationAuth?._id) return;
      
      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: integrationAuthApps?.find((integrationAuthApp) => integrationAuthApp.appId === targetAppId)?.name,
        appId: targetAppId,
        sourceEnvironment: sce,
        secretPath,
        metadata: {
          secretPrefix,
          secretSuffix,
          ...(sl ? {
            secretGCPLabel: {
              labelName,
              labelValue
            }
          } : {})
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
    integrationAuthApps ? (
    <form 
      onSubmit={handleSubmit(onFormSubmit)}
      className="flex h-full w-full items-center justify-center"
    >
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">GCP Secret Manager Integration</CardTitle>
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
                    name="targetAppId"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => {
                    return (
                      <FormControl
                        label="GCP Project"
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
                    )
                  }}
                />
                <Button
                  className="mt-4"
                  size="sm"
                  type="submit"
                  isLoading={isLoading}
                >
                  Create Integration
                </Button>
                </div>
            </motion.div>
          </TabPanel>
          <TabPanel value={TabSections.Options}>
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
            <div className="mt-8">
              <Controller
                control={control}
                name="shouldLabel"
                render={({ field: { onChange, value } }) => (
                  <Switch
                    id="label-gcp"
                    onCheckedChange={(isChecked) => onChange(isChecked)}
                    isChecked={value}
                  >
                    Label in GCP Secret Manager
                  </Switch>
                )}
              />
            </div>
            {shouldLabel && (
              <div className="mt-8">
                <Controller
                  control={control}
                  name="labelName"
                  render={({ field, fieldState: { error } }) => (
                      <FormControl
                          label="Label Name"
                          isError={Boolean(error)}
                          errorText={error?.message}
                      >
                      <Input 
                          {...field} 
                          placeholder="managed-by"
                      />
                      </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="labelValue"
                  render={({ field, fieldState: { error } }) => (
                      <FormControl
                          label="Label Name"
                          isError={Boolean(error)}
                          errorText={error?.message}
                      >
                      <Input 
                          {...field} 
                          placeholder="infisical"
                      />
                      </FormControl>
                  )}
                />
              </div>
            )}
          </TabPanel>
        </Tabs>
      </Card>
    </form>
  ) : (
    <div />
  );
}

GCPSecretManagerCreateIntegrationPage.requireAuth = true;