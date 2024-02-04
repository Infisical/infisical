import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
} from "@app/components/v2";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "@app/hooks/api/integrationAuth";
import { useGetWorkspaceById } from "@app/hooks/api/workspace";

const schema = yup.object({
  secretPath: yup.string().trim().required("Secret path is required"),
  sourceEnvironment: yup.string().trim().required("Project environment is required"),
  appId: yup.string().trim().required("Hasura Cloud project is required")
});

type FormData = yup.InferType<typeof schema>;

const APP_NAME = "Hasura Cloud";
export default function HasuraCloudCreateIntegrationPage() {
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: yupResolver(schema)
  });
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();
  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth, isLoading: isIntegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );

  const { data: integrationAuthApps, isLoading: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });

  const onFormSubmit = async ({ secretPath, sourceEnvironment, appId }: FormData) => {
    try {
      if (!integrationAuth?.id) return;

      const app = integrationAuthApps?.find((data) => data.appId === appId);
      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        sourceEnvironment,
        secretPath,
        appId,
        app: app?.name
      });

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth && workspace && integrationAuthApps ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Head>
        <title>Set Up {APP_NAME} Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle={`Choose which environment or folder in Infisical you want to sync to ${APP_NAME} environment variables.`}
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Hasura.svg"
                height={30}
                width={30}
                alt={`${APP_NAME} logo`}
              />
            </div>
            <span className="ml-2.5">{APP_NAME} Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/flyio" passHref>
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

        <form onSubmit={handleSubmit(onFormSubmit)} className="flex w-full flex-col px-6">
          <Controller
            control={control}
            name="sourceEnvironment"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Project Environment"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  className="w-full border border-mineshaft-500"
                  value={field.value}
                  onValueChange={(val) => {
                    field.onChange(val);
                  }}
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
              <FormControl label="Secrets Path" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} />
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="appId"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Hasura Cloud Project"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  className="w-full border border-mineshaft-500"
                  value={field.value}
                  isDisabled={integrationAuthApps?.length === 0}
                  onValueChange={(val) => {
                    field.onChange(val);
                  }}
                >
                  {integrationAuthApps?.map((project) => (
                    <SelectItem value={project.appId ?? ""} key={`project-id-${project.appId}`}>
                      {project.name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          <Button
            type="submit"
            color="mineshaft"
            variant="outline_bg"
            className="mb-6 mt-2 ml-auto"
            isLoading={isSubmitting}
          >
            Create Integration
          </Button>
        </form>
      </Card>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Set Up {APP_NAME} Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      {isIntegrationAuthLoading || isIntegrationAuthAppsLoading ? (
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

HasuraCloudCreateIntegrationPage.requireAuth = true;
