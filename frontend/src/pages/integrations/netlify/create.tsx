import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import queryString from "query-string";

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

const netlifyEnvironments = [
  { name: "Local development", slug: "dev" },
  { name: "Branch deploys", slug: "branch-deploy" },
  { name: "Deploy previews", slug: "deploy-preview" },
  { name: "Production", slug: "production" }
];

interface NetlifyCreateIntegrationFormValues {
  selectedSourceEnvironment: string;
  targetApp: string;
  targetEnvironment: string;
  secretPath: string;
}

export default function NetlifyCreateIntegrationPage() {
  const router = useRouter();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const { handleSubmit, setValue, getValues, control } =
    useForm<NetlifyCreateIntegrationFormValues>({
      defaultValues: {
        selectedSourceEnvironment: "",
        targetApp: "",
        targetEnvironment: "",
        secretPath: "/"
      }
    });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setValue("selectedSourceEnvironment", workspace.environments[0].slug);
      setValue("targetEnvironment", netlifyEnvironments[0].slug);
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

  const handleButtonClick = async (data: NetlifyCreateIntegrationFormValues) => {
    const { targetApp, targetEnvironment, selectedSourceEnvironment, secretPath } = data;
    try {
      setIsLoading(true);

      if (!integrationAuth?._id) return;

      await createIntegration({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: targetApp,
        appId:
          integrationAuthApps?.find((integrationAuthApp) => integrationAuthApp.name === targetApp)
            ?.appId ?? null,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment,
        targetEnvironmentId: null,
        targetService: null,
        targetServiceId: null,
        owner: null,
        path: null,
        region: null,
        secretPath
      });

      setIsLoading(false);
      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth &&
    workspace &&
    getValues("selectedSourceEnvironment") &&
    integrationAuthApps &&
    getValues("targetApp") &&
    getValues("targetEnvironment") ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Netlify Integration</CardTitle>
        <form onSubmit={handleSubmit(handleButtonClick)}>
          <Controller
            name="selectedSourceEnvironment"
            control={control}
            render={({ field }) => (
              <FormControl label="Project Environment">
                <Select
                  {...field}
                  onValueChange={field.onChange}
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
            render={({ field }) => (
              <FormControl label="Secrets Path">
                <Input {...field} placeholder="Provide a path, default is /" />
              </FormControl>
            )}
          />

          <Controller
            name="targetApp"
            control={control}
            render={({ field }) => (
              <FormControl label="Netlify Site">
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
                        key={`target-app-${integrationAuthApp.name}`}
                      >
                        {integrationAuthApp.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" key="target-app-none">
                      No sites found
                    </SelectItem>
                  )}
                </Select>
              </FormControl>
            )}
          />

          <Controller
            name="targetEnvironment"
            control={control}
            render={({ field }) => (
              <FormControl label="Netlify Context">
                <Select
                  {...field}
                  onValueChange={field.onChange}
                  className="w-full border border-mineshaft-500"
                >
                  {netlifyEnvironments.map((netlifyEnvironment) => (
                    <SelectItem
                      value={netlifyEnvironment.slug}
                      key={`target-environment-${netlifyEnvironment.slug}`}
                    >
                      {netlifyEnvironment.name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          <Button
            type="submit"
            color="mineshaft"
            className="mt-4"
            isLoading={isLoading}
            isDisabled={integrationAuthApps.length === 0}
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

NetlifyCreateIntegrationPage.requireAuth = true;
