import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { yupResolver } from "@hookform/resolvers/yup";
import queryString from "query-string";
import * as yup from "yup";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "../../../components/v2";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";
import createIntegration from "../../api/integrations/createIntegration";

const formSchema = yup.object({
  selectedSourceEnvironment: yup.string().required().label("Project Environment"),
  secretPath: yup.string().required().label("Secrets Path"),
  targetApp: yup.string().required().label("Supabase Project")
});

type FormData = yup.InferType<typeof formSchema>;

export default function SupabaseCreateIntegrationPage() {
  const router = useRouter();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const {
    handleSubmit,
    setValue,
    getValues,
    control,
    formState: { isSubmitting }
  } = useForm<FormData>({
    defaultValues: {
      selectedSourceEnvironment: "",
      secretPath: "/",
      targetApp: ""
    },
    resolver: yupResolver(formSchema)
  });

  useEffect(() => {
    if (workspace) {
      setValue("selectedSourceEnvironment", workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setValue("targetApp", integrationAuthApps[0].name);
      } else {
        setValue("targetApp", "none");
      }
    }
  }, [integrationAuthApps]);

  const handleButtonClick = async (data: FormData) => {
    const { targetApp, selectedSourceEnvironment, secretPath } = data;
    try {
      if (!integrationAuth?._id) return;

      await createIntegration({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: targetApp,
        appId:
          integrationAuthApps?.find((integrationAuthApp) => integrationAuthApp.name === targetApp)
            ?.appId ?? null,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: null,
        targetEnvironmentId: null,
        targetService: null,
        targetServiceId: null,
        owner: null,
        path: null,
        region: null,
        secretPath
      });

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth &&
    workspace &&
    getValues("selectedSourceEnvironment") &&
    integrationAuthApps &&
    getValues("targetApp") ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Supabase Integration</CardTitle>
        <form onSubmit={handleSubmit(handleButtonClick)}>
          <Controller
            name="selectedSourceEnvironment"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Project Environment"
                className="mt-4"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  {...field}
                  onValueChange={(val) => field.onChange(val)}
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
            name="secretPath"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Secrets Path" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} placeholder="Provide a path, default is /" />
              </FormControl>
            )}
          />

          <Controller
            name="targetApp"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Supabase Project"
                className="mt-4"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  {...field}
                  onValueChange={field.onChange}
                  className="w-full border border-mineshaft-500"
                  isDisabled={integrationAuthApps.length === 0}
                >
                  {integrationAuthApps.length > 0 ? (
                    integrationAuthApps.map((integrationAuthApp) => (
                      <SelectItem
                        value={integrationAuthApp.name}
                        key={`target-environment-${integrationAuthApp.name}`}
                      >
                        {integrationAuthApp.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" key="target-app-none">
                      No services found
                    </SelectItem>
                  )}
                </Select>
              </FormControl>
            )}
          />
          <Button
            color="mineshaft"
            className="mt-4"
            isLoading={isSubmitting}
            isDisabled={integrationAuthApps.length === 0}
            type="submit"
          >
            Create Integration
          </Button>
        </form>
      </Card>
    </div>
  ) : (
    <div />
  );
}

SupabaseCreateIntegrationPage.requireAuth = true;
