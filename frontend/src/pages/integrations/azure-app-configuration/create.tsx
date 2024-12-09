import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faQuestionCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import queryString from "query-string";
import { z } from "zod";

import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { useCreateIntegration } from "@app/hooks/api";
import { IntegrationSyncBehavior } from "@app/hooks/api/integrations/types";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem,
  Switch,
  Tooltip
} from "../../../components/v2";
import { useGetIntegrationAuthById } from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

const schema = z.object({
  baseUrl: z
    .string()
    .trim()
    .min(1, { message: "Azure App Configuration URL is required" })
    .url()
    .refine(
      (val) => val.endsWith(".azconfig.io"),
      "URL should have the following format: https://resource-name-here.azconfig.io"
    ),
  secretPath: z.string().trim().min(1, { message: "Secret path is required" }),
  sourceEnvironment: z.string().trim().min(1, { message: "Source environment is required" }),
  initialSyncBehavior: z.nativeEnum(IntegrationSyncBehavior),
  secretPrefix: z.string().default(""),
  useLabels: z.boolean().default(false)
});

type TFormSchema = z.infer<typeof schema>;

const initialSyncBehaviors = [
  {
    label: "No Import - Overwrite all values in Azure App Configuration",
    value: IntegrationSyncBehavior.OVERWRITE_TARGET
  },
  {
    label: "Import - Prefer values from Azure App Configuration",
    value: IntegrationSyncBehavior.PREFER_TARGET
  },
  { label: "Import - Prefer values from Infisical", value: IntegrationSyncBehavior.PREFER_SOURCE }
];

export default function AzureAppConfigurationCreateIntegration() {
  const router = useRouter();
  const {
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(schema),
    defaultValues: {
      secretPath: "/",
      secretPrefix: "",
      initialSyncBehavior: IntegrationSyncBehavior.PREFER_SOURCE
    }
  });

  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  useEffect(() => {
    if (workspace) {
      setValue("sourceEnvironment", workspace.environments[0].slug);
    }
  }, [workspace]);

  const sourceEnv = watch("sourceEnvironment");

  const handleIntegrationSubmit = async ({
    secretPath,
    useLabels,
    sourceEnvironment,
    baseUrl,
    initialSyncBehavior,
    secretPrefix
  }: TFormSchema) => {
    try {
      if (!integrationAuth?.id) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: baseUrl,
        sourceEnvironment,
        secretPath,
        metadata: {
          initialSyncBehavior,
          secretPrefix,
          azureUseLabels: useLabels
        }
      });

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth && workspace ? (
    <form
      onSubmit={handleSubmit(handleIntegrationSubmit)}
      className="flex h-full w-full flex-col items-center justify-center"
    >
      <Head>
        <title>Set Up Azure App Configuration Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="text-left text-xl"
          subTitle="Choose which environment in Infisical you want to sync to your Azure App Configuration."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <Image
                src="/images/integrations/Microsoft Azure.png"
                height={35}
                width={35}
                alt="Azure logo"
              />
            </div>
            <span className="ml-1.5">Azure App Configuration</span>
            <Link
              href="https://infisical.com/docs/integrations/cloud/azure-app-configuration"
              passHref
            >
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
        <div className="px-6">
          <div className="mb-2 -space-y-2">
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
                    dropdownContainerClassName="max-w-full"
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
              name="useLabels"
              render={({ field: { onChange, value } }) => (
                <Switch
                  id="use-environment-labels"
                  onCheckedChange={(isChecked) => onChange(isChecked)}
                  isChecked={value}
                >
                  <div className="flex items-center gap-1">
                    Use Environment Labels
                    <Tooltip
                      content={
                        <div>
                          <p>
                            Use the environment slug as the label on the secret keys created in
                            Azure App Configuration.
                            <br />
                            <br />
                            {sourceEnv && (
                              <p>
                                You have selected the{" "}
                                <span className="font-semibold">{sourceEnv}</span> environment,
                                therefore the label will be set to{" "}
                                <span className="font-semibold">{sourceEnv}</span>.
                              </p>
                            )}
                          </p>
                        </div>
                      }
                    >
                      <FontAwesomeIcon icon={faQuestionCircle} size="1x" />
                    </Tooltip>
                  </div>
                </Switch>
              )}
            />
          </div>
          <Controller
            control={control}
            name="secretPath"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Secrets Path" errorText={error?.message} isError={Boolean(error)}>
                <SecretPathInput {...field} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="baseUrl"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Azure App Configuration URL"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input
                  placeholder="https://infisical-configuration-integration-test.azconfig.io"
                  {...field}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="secretPrefix"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Key Prefix" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} />
              </FormControl>
            )}
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
                <Select
                  defaultValue={field.value}
                  onValueChange={(e) => onChange(e)}
                  className="w-full border border-mineshaft-500"
                  dropdownContainerClassName="max-w-full"
                >
                  {initialSyncBehaviors.map((b) => {
                    return (
                      <SelectItem
                        value={b.value}
                        key={`sync-behavior-${b.value}`}
                        className="w-full"
                      >
                        {b.label}
                      </SelectItem>
                    );
                  })}
                </Select>
              </FormControl>
            )}
          />
          <Button
            type="submit"
            color="mineshaft"
            variant="outline_bg"
            className="mb-6 mt-4 ml-auto"
            isLoading={isSubmitting}
          >
            Create Integration
          </Button>
        </div>
      </Card>
    </form>
  ) : (
    <div />
  );
}

AzureAppConfigurationCreateIntegration.requireAuth = true;
