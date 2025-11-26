import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "framer-motion";
import z from "zod";

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
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { Badge } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import { useGetIntegrationAuthById } from "@app/hooks/api/integrationAuth";
import { useGetIntegrationAuthAwsKmsKeys } from "@app/hooks/api/integrationAuth/queries";
import {
  IntegrationMappingBehavior,
  IntegrationMetadataSyncMode
} from "@app/hooks/api/integrations/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

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
];

const mappingBehaviors = [
  {
    label: "Many to One (All Infisical secrets will be mapped to a single AWS secret)",
    value: IntegrationMappingBehavior.MANY_TO_ONE
  },
  {
    label: "One to One - (Each Infisical secret will be mapped to its own AWS secret)",
    value: IntegrationMappingBehavior.ONE_TO_ONE
  }
];

const schema = z
  .object({
    awsRegion: z.string().trim().min(1, { message: "AWS region is required" }),
    secretPath: z.string().trim().min(1, { message: "Secret path is required" }),
    sourceEnvironment: z.string().trim().min(1, { message: "Source environment is required" }),
    secretPrefix: z.string().default(""),
    secretName: z.string().trim().min(1).optional(),
    mappingBehavior: z.nativeEnum(IntegrationMappingBehavior),
    kmsKeyId: z.string().optional(),
    shouldTag: z.boolean().optional(),
    metadataSyncMode: z.nativeEnum(IntegrationMetadataSyncMode).optional(),
    tags: z
      .object({
        key: z.string(),
        value: z.string()
      })
      .array()
  })
  .refine(
    (val) =>
      val.mappingBehavior === IntegrationMappingBehavior.ONE_TO_ONE ||
      (val.mappingBehavior === IntegrationMappingBehavior.MANY_TO_ONE &&
        val.secretName &&
        val.secretName !== ""),
    {
      message: "Secret name must be defined for many-to-one integrations",
      path: ["secretName"]
    }
  );

type TFormSchema = z.infer<typeof schema>;

export const AwsSecretManagerConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const {
    control,
    setValue,
    handleSubmit,
    watch,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(schema),
    defaultValues: {
      shouldTag: false,
      secretPath: "/",
      secretPrefix: "",
      mappingBehavior: IntegrationMappingBehavior.MANY_TO_ONE,
      tags: []
    }
  });

  const shouldTagState = watch("shouldTag");
  const selectedMetadataSyncMode = watch("metadataSyncMode");
  const selectedSourceEnvironment = watch("sourceEnvironment");
  const selectedAWSRegion = watch("awsRegion");
  const selectedMappingBehavior = watch("mappingBehavior");
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.AwsSecretManagerConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { currentProject } = useProject();
  const { data: integrationAuth, isPending: isintegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );

  const { data: integrationAuthAwsKmsKeys, isPending: isIntegrationAuthAwsKmsKeysLoading } =
    useGetIntegrationAuthAwsKmsKeys({
      integrationAuthId: String(integrationAuthId),
      region: selectedAWSRegion
    });

  useEffect(() => {
    if (currentProject) {
      setValue("sourceEnvironment", currentProject.environments[0].slug);
      setValue("awsRegion", awsRegions[0].slug);
    }
  }, [currentProject]);

  const handleButtonClick = async ({
    secretName,
    sourceEnvironment,
    awsRegion,
    secretPath,
    shouldTag,
    tags,
    secretPrefix,
    kmsKeyId,
    mappingBehavior,
    metadataSyncMode
  }: TFormSchema) => {
    try {
      if (!integrationAuth?.id) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: secretName,
        sourceEnvironment,
        region: awsRegion,
        secretPath,
        metadata: {
          ...(shouldTag
            ? {
                secretAWSTag: tags,
                metadataSyncMode
              }
            : {}),
          ...(secretPrefix && { secretPrefix }),
          ...(kmsKeyId && { kmsKeyId }),
          mappingBehavior
        }
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search: {
          selectedTab: IntegrationsListPageTabs.NativeIntegrations
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth && selectedSourceEnvironment && !isIntegrationAuthAwsKmsKeysLoading ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Helmet>
        <title>Set Up AWS Secrets Manager Integration</title>
      </Helmet>
      <form onSubmit={handleSubmit(handleButtonClick)}>
        <Card className="max-w-lg rounded-md border border-mineshaft-600">
          <CardTitle
            className="px-6 text-left text-xl"
            subTitle="Choose which environment in Infisical you want to sync to secerts in AWS Secrets Manager."
          >
            <div className="flex flex-row items-center">
              <div className="flex items-center">
                <img
                  src="/images/integrations/Amazon Web Services.png"
                  height={35}
                  width={35}
                  alt="AWS logo"
                />
              </div>
              <span className="ml-1.5">AWS Secrets Manager Integration </span>
              <a
                href="https://infisical.com/docs/integrations/cloud/aws-secret-manager"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="text-xxs mb-[0.07rem] ml-1.5"
                  />
                </div>
              </a>
            </div>
          </CardTitle>
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
                        {currentProject?.environments.map((sourceEnvironment) => (
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
                      <SecretPathInput {...field} environment={selectedSourceEnvironment} />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="awsRegion"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl
                      label="AWS region"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Select
                        defaultValue={field.value}
                        onValueChange={(e) => onChange(e)}
                        className="w-full border border-mineshaft-500"
                        dropdownContainerClassName="max-w-full"
                      >
                        {awsRegions.map((awsRegion) => (
                          <SelectItem
                            value={awsRegion.slug}
                            className="flex w-full justify-between"
                            key={`aws-environment-${awsRegion.slug}`}
                          >
                            {awsRegion.name} <Badge variant="neutral">{awsRegion.slug}</Badge>
                          </SelectItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="mappingBehavior"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl
                      label="Mapping Behavior"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Select
                        defaultValue={field.value}
                        onValueChange={(e) => {
                          if (e === IntegrationMappingBehavior.MANY_TO_ONE) {
                            setValue("metadataSyncMode", IntegrationMetadataSyncMode.CUSTOM);
                          }
                          onChange(e);
                        }}
                        className="w-full border border-mineshaft-500"
                        dropdownContainerClassName="max-w-full"
                      >
                        {mappingBehaviors.map((option) => (
                          <SelectItem
                            value={option.value}
                            className="text-left"
                            key={`mapping-behavior-${option.value}`}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
                {selectedMappingBehavior === IntegrationMappingBehavior.MANY_TO_ONE && (
                  <Controller
                    control={control}
                    name="secretName"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="AWS SM Secret Name"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Input
                          placeholder={`${currentProject.name
                            .toLowerCase()
                            .replace(/ /g, "-")}/${selectedSourceEnvironment}`}
                          {...field}
                        />
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
                <div className="mt-2 mb-3 ml-1">
                  <Controller
                    control={control}
                    name="shouldTag"
                    render={({ field: { onChange, value } }) => (
                      <Switch
                        id="tag-aws"
                        onCheckedChange={(isChecked) => {
                          if (
                            isChecked &&
                            selectedMappingBehavior === IntegrationMappingBehavior.ONE_TO_ONE
                          ) {
                            setValue(
                              "metadataSyncMode",
                              IntegrationMetadataSyncMode.SECRET_METADATA
                            );
                          }
                          onChange(isChecked);
                        }}
                        isChecked={value}
                      >
                        Tag in AWS Secrets Manager
                      </Switch>
                    )}
                  />
                </div>
                {shouldTagState &&
                  selectedMappingBehavior === IntegrationMappingBehavior.ONE_TO_ONE && (
                    <Controller
                      control={control}
                      name="metadataSyncMode"
                      render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                        <FormControl
                          label="Tag Sync Mode"
                          errorText={error?.message}
                          isError={Boolean(error)}
                        >
                          <Select
                            defaultValue={field.value}
                            onValueChange={(e) => {
                              setValue("tags", []);
                              onChange(e);
                            }}
                            className="w-full border border-mineshaft-500"
                            dropdownContainerClassName="max-w-full"
                          >
                            <SelectItem
                              value={IntegrationMetadataSyncMode.SECRET_METADATA}
                              className="text-left"
                              key={`sync-mode-${IntegrationMetadataSyncMode.SECRET_METADATA}`}
                            >
                              Secret Metadata
                            </SelectItem>
                            <SelectItem
                              value={IntegrationMetadataSyncMode.CUSTOM}
                              className="text-left"
                              key={`sync-mode-${IntegrationMetadataSyncMode.CUSTOM}`}
                            >
                              Custom
                            </SelectItem>
                          </Select>
                        </FormControl>
                      )}
                    />
                  )}
                {shouldTagState &&
                  selectedMetadataSyncMode === IntegrationMetadataSyncMode.CUSTOM && (
                    <div className="mt-4 flex justify-between">
                      <Controller
                        control={control}
                        name="tags.0.key"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Tag Key"
                            errorText={error?.message}
                            isError={Boolean(error)}
                          >
                            <Input placeholder="managed-by" {...field} />
                          </FormControl>
                        )}
                      />
                      <Controller
                        control={control}
                        name="tags.0.value"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Tag Value"
                            errorText={error?.message}
                            isError={Boolean(error)}
                          >
                            <Input placeholder="infisical" {...field} />
                          </FormControl>
                        )}
                      />
                    </div>
                  )}
                <Controller
                  control={control}
                  name="secretPrefix"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Secret Prefix"
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="mt-4"
                    >
                      <Input placeholder="INFISICAL_" {...field} />
                    </FormControl>
                  )}
                />

                <Controller
                  control={control}
                  name="kmsKeyId"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl
                      label="Encryption Key"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Select
                        defaultValue={field.value}
                        onValueChange={(e) => onChange(e)}
                        className="w-full border border-mineshaft-500"
                        dropdownContainerClassName="max-w-full"
                      >
                        {integrationAuthAwsKmsKeys?.length ? (
                          integrationAuthAwsKmsKeys.map((key) => {
                            return (
                              <SelectItem
                                value={key.id as string}
                                key={`repo-id-${key.id}`}
                                className="w-[28.4rem] text-sm"
                              >
                                {key.alias}
                              </SelectItem>
                            );
                          })
                        ) : (
                          <SelectItem isDisabled value="no-keys" key="no-keys">
                            No KMS keys available
                          </SelectItem>
                        )}
                      </Select>
                    </FormControl>
                  )}
                />
              </motion.div>
            </TabPanel>
          </Tabs>
          <Button
            color="mineshaft"
            variant="outline_bg"
            type="submit"
            className="mt-2 mr-6 mb-6 ml-auto"
            isLoading={isSubmitting}
          >
            Create Integration
          </Button>
        </Card>
        <div className="mt-6 w-full max-w-md border-t border-mineshaft-800" />
        <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
          <div className="flex flex-row items-center">
            <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-mineshaft-200" />{" "}
            <span className="text-md ml-3 text-mineshaft-100">Pro Tip</span>
          </div>
          <span className="mt-4 text-sm text-mineshaft-300">
            After creating an integration, your secrets will start syncing immediately. This might
            cause an unexpected override of current secrets in AWS Secrets Manager with secrets from
            Infisical.
          </span>
        </div>
      </form>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Set Up AWS Secrets Manager Integration</title>
      </Helmet>
      {isintegrationAuthLoading || isIntegrationAuthAwsKmsKeysLoading ? (
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
};
