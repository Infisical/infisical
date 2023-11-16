import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import { useRouter } from "next/router";
import { yupResolver } from "@hookform/resolvers/yup";
import queryString from "query-string";
import * as yup from "yup";

import { useCreateIntegration, useGetWorkspaceById } from "@app/hooks/api";

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

const cloudflareEnvironments = [
  { name: "Production", slug: "production" },
  { name: "Preview", slug: "preview" }
];

const schema = yup.object({
  selectedSourceEnvironment: yup.string().required("Source environment is required"),
  secretPath: yup.string().required("Secret path is required"),
  targetAppId: yup.string().required("Cloudfare Pages project is required"),
  targetEnvironment: yup.string().oneOf(
    cloudflareEnvironments.map((env) => env.slug),
    "Invalid Cloudflare Pages environment"
  )
});

type FormData = yup.InferType<typeof schema>;

export default function CloudflarePagesIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();
  const { control, handleSubmit, setValue, watch } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      secretPath: "/",
      targetEnvironment: cloudflareEnvironments[0].slug
    }
  });
  const selectedSourceEnvironment = watch("selectedSourceEnvironment");
  const targetAppIdValue = watch("targetAppId");

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);
  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setValue("selectedSourceEnvironment", workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setValue("targetAppId", String(integrationAuthApps[0].appId));
      } else {
        setValue("targetAppId", "none");
      }
    }
  }, [integrationAuthApps]);

  const onFormSubmit = async ({
    selectedSourceEnvironment: sse,
    secretPath,
    targetAppId,
    targetEnvironment
  }: FormData) => {
    try {
      setIsLoading(true);
      if (!integrationAuth?._id) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: integrationAuthApps?.find(
          (integrationAuthApp) => String(integrationAuthApp.appId) === targetAppId
        )?.name,
        appId: targetAppId,
        sourceEnvironment: sse,
        targetEnvironment,
        secretPath
      });

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return integrationAuth && workspace && selectedSourceEnvironment && integrationAuthApps ? (
    <form
      onSubmit={handleSubmit((data: FormData) => {
        onFormSubmit(data);
      })}
      className="flex h-full w-full flex-col items-center justify-center"
    >
      <Head>
        <title>Set Up Cloudfare Pages Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Choose which environment in Infisical you want to sync with your Cloudflare Pages project."
        >
          Cloudflare Pages Integration
        </CardTitle>
        <Controller
          control={control}
          name="selectedSourceEnvironment"
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl
              label="Infisical Project Environment"
              errorText={error?.message}
              isError={Boolean(error)}
              className="px-6"
            >
              <Select
                defaultValue={field.value}
                {...field}
                onValueChange={(val) => onChange(val)}
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
          name="targetAppId"
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl
              label="Cloudflare Pages Project"
              errorText={error?.message}
              isError={Boolean(error)}
              className="px-6"
            >
              <Select
                {...field}
                onValueChange={(val) => {
                  if (val) {
                    onChange(val);
                  }
                }}
                className="w-full border border-mineshaft-500"
                isDisabled={integrationAuthApps.length === 0}
              >
                {integrationAuthApps.length > 0 ? (
                  integrationAuthApps.map((integrationAuthApp) => (
                    <SelectItem
                      value={String(integrationAuthApp.appId)}
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
          )}
        />
        <Controller
          control={control}
          name="targetEnvironment"
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl
              label="Cloudflare Pages Environment"
              errorText={error?.message}
              isError={Boolean(error)}
              className="px-6"
            >
              <Select
                {...field}
                onValueChange={(val) => onChange(val)}
                className="w-full border border-mineshaft-500"
              >
                {cloudflareEnvironments.map((cloudflareEnvironment) => (
                  <SelectItem
                    value={cloudflareEnvironment.slug}
                    key={`target-environment-${cloudflareEnvironment.slug}`}
                  >
                    {cloudflareEnvironment.name}
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
              className="px-6"
            >
              <Input {...field} placeholder="Provide a path, default is /" />
            </FormControl>
          )}
        />
        <Button
          colorSchema="primary"
          variant="outline_bg"
          className="mt-2 mb-8 ml-auto mr-6 w-min"
          size="sm"
          type="submit"
          isLoading={isLoading}
          isDisabled={targetAppIdValue === "none"}
        >
          Create Integration
        </Button>
      </Card>
    </form>
  ) : (
    <div />
  );
}

CloudflarePagesIntegrationPage.requireAuth = true;
