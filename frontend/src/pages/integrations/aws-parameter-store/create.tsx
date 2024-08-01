import { useCallback, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import { useRouter } from "next/router";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import queryString from "query-string";
import { z } from "zod";

import IntegrationCreate from "@app/components/integrations/IntegrationCreate";
import { isValidAWSParameterStorePath } from "@app/helpers/aws";
import { isValidPath } from "@app/helpers/string";
import { useCreateIntegration, useGetWorkspaceById } from "@app/hooks/api";
import { useGetIntegrationAuthAwsKmsKeys } from "@app/hooks/api/integrationAuth/queries";

import {
  Button,
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

enum TabSections {
  Connection = "connection",
  Options = "options"
}

const awsRegions = [
  { name: "US East (Ohio)", slug: "us-east-2" },
  { name: "US East (N. Virginia)", slug: "us-east-1" },
  { name: "US West (N. California)", slug: "us-west-1" },
  { name: "US West (Oregon)", slug: "us-west-2" },
  { name: "Africa (Cape Town)", slug: "af-south-1" },
  { name: "Asia Pacific (Hong Kong)", slug: "ap-east-1" },
  { name: "Asia Pacific (Hyderabad)", slug: "ap-south-2" },
  { name: "Asia Pacific (Jakarta)", slug: "ap-southeast-3" },
  { name: "Asia Pacific (Melbourne)", slug: "ap-southeast-4" },
  { name: "Asia Pacific (Mumbai)", slug: "ap-south-1" },
  { name: "Asia Pacific (Osaka)", slug: "ap-northeast-3" },
  { name: "Asia Pacific (Seoul)", slug: "ap-northeast-2" },
  { name: "Asia Pacific (Singapore)", slug: "ap-southeast-1" },
  { name: "Asia Pacific (Sydney)", slug: "ap-southeast-2" },
  { name: "Asia Pacific (Tokyo)", slug: "ap-northeast-1" },
  { name: "Canada (Central)", slug: "ca-central-1" },
  { name: "Europe (Frankfurt)", slug: "eu-central-1" },
  { name: "Europe (Ireland)", slug: "eu-west-1" },
  { name: "Europe (London)", slug: "eu-west-2" },
  { name: "Europe (Milan)", slug: "eu-south-1" },
  { name: "Europe (Paris)", slug: "eu-west-3" },
  { name: "Europe (Spain)", slug: "eu-south-2" },
  { name: "Europe (Stockholm)", slug: "eu-north-1" },
  { name: "Europe (Zurich)", slug: "eu-central-2" },
  { name: "Middle East (Bahrain)", slug: "me-south-1" },
  { name: "Middle East (UAE)", slug: "me-central-1" },
  { name: "South America (Sao Paulo)", slug: "sa-east-1" },
  { name: "AWS GovCloud (US-East)", slug: "us-gov-east-1" },
  { name: "AWS GovCloud (US-West)", slug: "us-gov-west-1" }
] as const;

const formSchema = z
  .object({
    environment: z.string().trim().min(1, { message: "Environment is required." }),
    secretsPath: z
      .string()
      .trim()
      .min(1)
      .refine((val) => isValidPath(val, { allowTrailingSlash: true }), {
        message: "Infinsical secrets path has to be a valid path."
      }),
    awsRegion: z.enum(awsRegions.map((region) => region.slug) as unknown as [string, ...string[]]),
    awsParameterStorePath: z
      .string()
      .trim()
      .min(1)
      .refine((val) => isValidAWSParameterStorePath(val), {
        message: "AWS Parameter Store secrets path has to be a valid path."
      }),
    disableDeletingSecretsInAWSParameterStore: z.boolean(),
    shouldTagInAWSParameterStore: z.boolean(),
    tagKey: z.string().optional(),
    tagValue: z.string().optional(),
    kmsKeyId: z.string().optional()
  })
  .superRefine(({ tagKey, tagValue, shouldTagInAWSParameterStore }, refinementContext) => {
    if (shouldTagInAWSParameterStore && (!tagKey || tagKey.trim().length === 0)) {
      refinementContext.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tag key cannot be blank.",
        path: ["tagKey"]
      });
    }

    if (shouldTagInAWSParameterStore && (!tagValue || tagValue.trim().length === 0)) {
      refinementContext.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tag value cannot be blank.",
        path: ["tagValue"]
      });
    }
  });

export default function AWSParameterStoreCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);
  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting }
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      awsParameterStorePath: "",
      awsRegion: "us-east-1",
      disableDeletingSecretsInAWSParameterStore: false,
      environment: "",
      kmsKeyId: "",
      secretsPath: "/",
      shouldTagInAWSParameterStore: false
    }
  });
  const environment = watch("environment");
  const awsRegion = watch("awsRegion");
  const shouldTagInAWSParameterStore = watch("shouldTagInAWSParameterStore");

  useEffect(() => {
    if (workspace) {
      setValue("environment", workspace.environments[0].slug);
    }
  }, [workspace]);

  const { data: integrationAuthAwsKmsKeys, isLoading: isIntegrationAuthAwsKmsKeysLoading } =
    useGetIntegrationAuthAwsKmsKeys({
      integrationAuthId: String(integrationAuthId),
      region: awsRegion
    });

  const createIntegration = useCallback(
    async (formData: z.infer<typeof formSchema> & { integrationAuthId: string }) => {
      await mutateAsync({
        integrationAuthId: formData.integrationAuthId,
        isActive: true,
        sourceEnvironment: formData.environment,
        path: formData.awsParameterStorePath,
        region: formData.awsRegion,
        secretPath: formData.secretsPath,
        metadata: {
          ...(formData.shouldTagInAWSParameterStore
            ? {
                secretAWSTag: [
                  {
                    key: formData.tagKey!,
                    value: formData.tagValue!
                  }
                ]
              }
            : {}),
          ...(formData.kmsKeyId && { kmsKeyId: formData.kmsKeyId }),
          ...(formData.disableDeletingSecretsInAWSParameterStore && {
            shouldDisableDelete: formData.disableDeletingSecretsInAWSParameterStore
          })
        }
      });
    },
    [mutateAsync]
  );

  return (
    <IntegrationCreate
      showSetUp={Boolean(environment.trim().length && !isIntegrationAuthAwsKmsKeysLoading)}
      proTipText="After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in AWS Parameter Store with secrets from
          Infisical."
      cardSubtitle="Choose which environment in Infisical you want to sync to secerts in AWS Parameter Store."
      documentationLink="https://infisical.com/docs/integrations/cloud/aws-parameter-store"
      handleSubmit={handleSubmit}
      imageSrc="/images/integrations/Amazon Web Services.png"
      logoWidth={35}
      logoHeight={35}
      createIntegration={createIntegration}
      areIntegrationResourcesLoading={isIntegrationAuthAwsKmsKeysLoading}
    >
      <Head>
        <title>Authorize AWS Parameter Store Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Tabs defaultValue={TabSections.Connection} className="px-6">
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
              name="environment"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Project Environment"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired
                >
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    className="w-full border border-mineshaft-500"
                  >
                    {workspace?.environments.map((sourceEnvironment) => (
                      <SelectItem
                        value={sourceEnvironment.slug}
                        key={`env-${sourceEnvironment.slug}`}
                      >
                        {sourceEnvironment.name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              name="secretsPath"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Secrets Path"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired
                >
                  <Input {...field} placeholder="Provide a path, default is /" />
                </FormControl>
              )}
            />
            <Controller
              name="awsRegion"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  isRequired
                  label="AWS Region"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    className="w-full border border-mineshaft-500"
                  >
                    {awsRegions.map((region) => (
                      <SelectItem value={region.slug} key={`aws-region-${region.slug}`}>
                        {region.name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              name="awsParameterStorePath"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="AWS Parameter Store Path"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired
                  autoFocus
                >
                  <Input
                    placeholder={`/${workspace?.name
                      .toLowerCase()
                      .replace(/ /g, "-")}/${environment}/`}
                    {...field}
                  />
                </FormControl>
              )}
            />
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
            <div className="mt-2 ml-1">
              <Controller
                name="disableDeletingSecretsInAWSParameterStore"
                control={control}
                render={({ field }) => (
                  <Switch id="delete-aws" onCheckedChange={field.onChange} isChecked={field.value}>
                    Disable deleting secrets in AWS Parameter Store
                  </Switch>
                )}
              />
            </div>
            <div className="mt-4 ml-1">
              <Controller
                name="shouldTagInAWSParameterStore"
                control={control}
                render={({ field }) => (
                  <Switch id="tag-aws" onCheckedChange={field.onChange} isChecked={field.value}>
                    Tag in AWS Parameter Store
                  </Switch>
                )}
              />
            </div>
            {shouldTagInAWSParameterStore && (
              <div className="mt-4">
                <Controller
                  name="tagKey"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Tag Key"
                      errorText={error?.message}
                      isError={Boolean(error)}
                      isRequired={shouldTagInAWSParameterStore}
                    >
                      <Input placeholder="managed-by" {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  name="tagValue"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Tag Value"
                      errorText={error?.message}
                      isError={Boolean(error)}
                      isRequired={shouldTagInAWSParameterStore}
                    >
                      <Input placeholder="infisical" {...field} />
                    </FormControl>
                  )}
                />
              </div>
            )}
            <Controller
              name="kmsKeyId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Encryption Key"
                  className="mt-4"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    className="w-full border border-mineshaft-500"
                  >
                    <SelectItem
                      value="EMPTY-VALUE"
                      key="__unselect-special__"
                      className="w-[28.4rem] text-sm"
                    >
                      unselect
                    </SelectItem>
                    {integrationAuthAwsKmsKeys?.length ? (
                      integrationAuthAwsKmsKeys.map((key) => (
                        <SelectItem
                          value={key.id as string}
                          key={`repo-id-${key.id}`}
                          className="w-[28.4rem] text-sm"
                        >
                          {key.alias}
                        </SelectItem>
                      ))
                    ) : (
                      <div />
                    )}
                  </Select>
                </FormControl>
              )}
            />
          </motion.div>
        </TabPanel>
      </Tabs>
      <Button className="mb-6 mt-2 ml-auto mr-6 w-min" type="submit" isLoading={isSubmitting}>
        Create Integration
      </Button>
    </IntegrationCreate>
  );
}

AWSParameterStoreCreateIntegrationPage.requireAuth = true;
