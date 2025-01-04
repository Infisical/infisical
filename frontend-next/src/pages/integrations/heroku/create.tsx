import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs
  // faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import queryString from "query-string";
// import { useGetIntegrationAuthHerokuPipelines } from "@app/hooks/api/integrationAuth/queries";
// import { App, Pipeline } from "@app/hooks/api/integrationAuth/types";
import * as yup from "yup";

import { SecretPathInput } from "@app/components/v2/SecretPathInput";
// import { RadioGroup } from "@app/components/v2/RadioGroup";
import { useCreateIntegration } from "@app/hooks/api";
import { IntegrationSyncBehavior } from "@app/hooks/api/integrations/types";

import { Button, Card, CardTitle, FormControl, Select, SelectItem } from "../../../components/v2";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "../../../hooks/api/integrationAuth";
import {
  // useCreateWsEnvironment,
  useGetWorkspaceById
} from "../../../hooks/api/workspace";

const initialSyncBehaviors = [
  {
    label: "No Import - Overwrite all values in Heroku",
    value: IntegrationSyncBehavior.OVERWRITE_TARGET
  },
  { label: "Import - Prefer values from Heroku", value: IntegrationSyncBehavior.PREFER_TARGET },
  { label: "Import - Prefer values from Infisical", value: IntegrationSyncBehavior.PREFER_SOURCE }
];

const schema = yup.object({
  selectedSourceEnvironment: yup.string().required("Source environment is required"),
  secretPath: yup.string().required("Secret path is required"),
  targetApp: yup.string().required("Heroku app is required"),
  initialSyncBehavior: yup
    .string()
    .oneOf(
      initialSyncBehaviors.map((b) => b.value),
      "Invalid initial sync behavior"
    )
    .required("Initial sync behavior is required")
});

type FormData = yup.InferType<typeof schema>;

export default function HerokuCreateIntegrationPage() {
  const router = useRouter();

  const { control, handleSubmit, setValue, watch } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      secretPath: "/",
      initialSyncBehavior: IntegrationSyncBehavior.PREFER_SOURCE
    }
  });

  const selectedSourceEnvironment = watch("selectedSourceEnvironment");

  const { mutateAsync } = useCreateIntegration();
  // const { mutateAsync: mutateAsyncEnv } = useCreateWsEnvironment();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isLoading: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });

  // const { data: integrationAuthPipelineCouplings } = useGetIntegrationAuthHerokuPipelines({
  //   integrationAuthId: (integrationAuthId as string) ?? ""
  // });

  // const [uniquePipelines, setUniquePipelines] = useState<Pipeline[]>();
  // const [selectedPipeline, setSelectedPipeline] = useState("");
  // const [selectedPipelineApps, setSelectedPipelineApps] = useState<App[]>();
  // const [integrationType, setIntegrationType] = useState("App");

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setValue("selectedSourceEnvironment", workspace.environments[0].slug);
    }
  }, [workspace]);

  // useEffect(() => {
  //   if (integrationAuthPipelineCouplings) {
  //       const uniquePipelinesConst = Array.from(
  //         new Set(
  //           integrationAuthPipelineCouplings
  //             .map(({ pipeline: { pipelineId, name } }) => ({
  //               name,
  //               pipelineId
  //             }))
  //             .map((obj) => JSON.stringify(obj))
  //         )).map((str) => JSON.parse(str)) as { pipelineId: string; name: string }[]

  //         [... (new Set())]
  //       setUniquePipelines(uniquePipelinesConst);
  //       if (uniquePipelinesConst) {
  //         if (uniquePipelinesConst!.length > 0) {
  //           setSelectedPipeline(uniquePipelinesConst![0].name);
  //         } else {
  //           setSelectedPipeline("none");
  //         }
  //       }
  //   }
  // }, [integrationAuthPipelineCouplings]);

  // useEffect(() => {
  //   if (integrationAuthPipelineCouplings) {
  //     setSelectedPipelineApps(integrationAuthApps?.filter(app => integrationAuthPipelineCouplings
  //       .filter((pipelineCoupling) => pipelineCoupling.pipeline.name === selectedPipeline)
  //       .map(coupling => coupling.app.appId).includes(String(app.appId))))
  //   }
  // }, [selectedPipeline]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setValue("targetApp", integrationAuthApps[0].name);
      } else {
        setValue("targetApp", "none");
      }
    }
  }, [integrationAuthApps]);

  // const handleButtonClick = async () => {
  //   try {
  //     setIsLoading(true);

  //     if (!integrationAuth?.id) return;

  //     if (integrationType === "App") {
  //       await mutateAsync({
  //         integrationAuthId: integrationAuth?.id,
  //         isActive: true,
  //         app: targetApp,
  //         sourceEnvironment: selectedSourceEnvironment,
  //         secretPath
  //       });
  //     } else if (integrationType === "Pipeline") {
  //       selectedPipelineApps?.map(async (app, index) => {
  //         setTimeout(async () => {
  //           await mutateAsyncEnv({
  //             workspaceId: String(localStorage.getItem("projectData.id")),
  //             name: app.name,
  //             slug: app.name.toLowerCase().replaceAll(" ", "-")
  //           });
  //           await mutateAsync({
  //             integrationAuthId: integrationAuth?.id,
  //             isActive: true,
  //             app: app.name,
  //             sourceEnvironment: app.name.toLowerCase().replaceAll(" ", "-"),
  //             secretPath
  //           })
  //         }, 1000*index)
  //       })
  //     }

  //     setIsLoading(false);
  //     router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
  //   } catch (err) {
  //     console.error(err);
  //   }
  // };

  const onFormSubmit = async ({ secretPath, targetApp, initialSyncBehavior }: FormData) => {
    try {
      if (!integrationAuth?.id) return;

      setIsLoading(true);

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: targetApp,
        sourceEnvironment: selectedSourceEnvironment,
        secretPath,
        metadata: {
          initialSyncBehavior
        }
      });

      setIsLoading(false);
      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth && workspace && selectedSourceEnvironment && integrationAuthApps ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Head>
        <title>Set Up Heroku Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Select which environment or folder in Infisical you want to sync to Heroku's environment variables."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <Image
                src="/images/integrations/Heroku.png"
                height={30}
                width={30}
                alt="Heroku logo"
              />
            </div>
            <span className="ml-2">Heroku Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/heroku" passHref>
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
        <form onSubmit={handleSubmit(onFormSubmit)} className="px-6">
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
              <FormControl label="Secrets Path" isError={Boolean(error)} errorText={error?.message}>
                <SecretPathInput
                  {...field}
                  placeholder="/"
                  environment={selectedSourceEnvironment}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="targetApp"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => {
              return (
                <FormControl label="Heroku App" errorText={error?.message} isError={Boolean(error)}>
                  <Select
                    {...field}
                    onValueChange={(e) => {
                      if (e === "") return;
                      onChange(e);
                    }}
                    className="w-full"
                  >
                    {integrationAuthApps.length > 0 ? (
                      integrationAuthApps.map((integrationAuthApp) => (
                        <SelectItem
                          value={String(integrationAuthApp.name as string)}
                          key={`target-app-${String(integrationAuthApp.appId)}`}
                        >
                          {integrationAuthApp.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" key="target-app-none">
                        No apps found
                      </SelectItem>
                    )}
                  </Select>
                </FormControl>
              );
            }}
          />
          <Controller
            control={control}
            name="initialSyncBehavior"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Initial Sync Behavior"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select {...field} onValueChange={(e) => onChange(e)} className="w-full">
                  {initialSyncBehaviors.map((b) => {
                    return (
                      <SelectItem value={b.value} key={`sync-behavior-${b.value}`}>
                        {b.label}
                      </SelectItem>
                    );
                  })}
                </Select>
              </FormControl>
            )}
          />
          <Button
            colorSchema="primary"
            variant="outline_bg"
            className="mb-6 mt-2 ml-auto"
            size="sm"
            type="submit"
            isLoading={isLoading}
            isDisabled={integrationAuthApps.length === 0}
          >
            Create Integration
          </Button>
        </form>
      </Card>
      {/* {integrationType === "App" && <>
      <div className="mt-6 w-full max-w-md border-t border-mineshaft-800" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-mineshaft-200" />{" "}
          <span className="text-md ml-3 text-mineshaft-100">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-mineshaft-300">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in Heroku with secrets from Infisical.
        </span>
      </div></>} */}
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Set Up Vercel Integration</title>
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
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
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

HerokuCreateIntegrationPage.requireAuth = true;
