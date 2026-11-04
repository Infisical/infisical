import { useEffect } from "react";
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
import { motion } from "motion/react";
import z from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  ProviderIcon,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle
} from "@app/components/v3";
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
      <PageTitle title="Set Up AWS Secrets Manager Integration" />
      <form onSubmit={handleSubmit(handleButtonClick)}>
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>
              <ProviderIcon icon="Amazon Web Services.png" height={35} width={35} alt="AWS logo" />
              <span>AWS Secrets Manager Integration</span>
            </CardTitle>
            <CardDescription>
              Choose which environment in Infisical you want to sync to secerts in AWS Secrets
              Manager.
            </CardDescription>
            <CardAction>
              <Badge variant="info" asChild>
                <a
                  href="https://infisical.com/docs/integrations/cloud/aws-secret-manager"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FontAwesomeIcon icon={faBookOpen} />
                  Docs
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                </a>
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Tabs defaultValue={TabSections.Connection}>
              <TabsList variant="project">
                <TabsTrigger value={TabSections.Connection}>Connection</TabsTrigger>
                <TabsTrigger value={TabSections.Options}>Options</TabsTrigger>
              </TabsList>
              <TabsContent value={TabSections.Connection}>
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
                      <Field className="mb-4" data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="awssecretmanager-sourceenvironment">
                          Project Environment
                        </FieldLabel>
                        <Select
                          value={field.value}
                          onValueChange={(val) => {
                            field.onChange(val);
                          }}
                        >
                          <SelectTrigger
                            className="w-full"
                            id="awssecretmanager-sourceenvironment"
                            isError={Boolean(error)}
                            aria-describedby={
                              error ? "awssecretmanager-sourceenvironment-error" : undefined
                            }
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {currentProject?.environments.map((sourceEnvironment) => (
                              <SelectItem
                                value={sourceEnvironment.slug}
                                key={`source-environment-${sourceEnvironment.slug}`}
                              >
                                {sourceEnvironment.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {Boolean(error) && (
                          <FieldError id="awssecretmanager-sourceenvironment-error">
                            {error?.message}
                          </FieldError>
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="secretPath"
                    render={({ field, fieldState: { error } }) => (
                      <Field className="mb-4" data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="awssecretmanager-secretpath">Secrets Path</FieldLabel>
                        <SecretPathInput
                          {...field}
                          environment={selectedSourceEnvironment}
                          id="awssecretmanager-secretpath"
                          isError={Boolean(error)}
                          aria-describedby={error ? "awssecretmanager-secretpath-error" : undefined}
                        />
                        {Boolean(error) && (
                          <FieldError id="awssecretmanager-secretpath-error">
                            {error?.message}
                          </FieldError>
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="awsRegion"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <Field className="mb-4" data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="awssecretmanager-awsregion">AWS region</FieldLabel>
                        <Select defaultValue={field.value} onValueChange={(e) => onChange(e)}>
                          <SelectTrigger
                            className="w-full"
                            id="awssecretmanager-awsregion"
                            isError={Boolean(error)}
                            aria-describedby={
                              error ? "awssecretmanager-awsregion-error" : undefined
                            }
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {awsRegions.map((awsRegion) => (
                              <SelectItem
                                value={awsRegion.slug}
                                key={`aws-environment-${awsRegion.slug}`}
                              >
                                {awsRegion.name} <Badge variant="neutral">{awsRegion.slug}</Badge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {Boolean(error) && (
                          <FieldError id="awssecretmanager-awsregion-error">
                            {error?.message}
                          </FieldError>
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="mappingBehavior"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <Field className="mb-4" data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="awssecretmanager-mappingbehavior">
                          Mapping Behavior
                        </FieldLabel>
                        <Select
                          defaultValue={field.value}
                          onValueChange={(e) => {
                            if (e === IntegrationMappingBehavior.MANY_TO_ONE) {
                              setValue("metadataSyncMode", IntegrationMetadataSyncMode.CUSTOM);
                            }
                            onChange(e);
                          }}
                        >
                          <SelectTrigger
                            className="w-full"
                            id="awssecretmanager-mappingbehavior"
                            isError={Boolean(error)}
                            aria-describedby={
                              error ? "awssecretmanager-mappingbehavior-error" : undefined
                            }
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {mappingBehaviors.map((option) => (
                              <SelectItem
                                value={option.value}
                                key={`mapping-behavior-${option.value}`}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {Boolean(error) && (
                          <FieldError id="awssecretmanager-mappingbehavior-error">
                            {error?.message}
                          </FieldError>
                        )}
                      </Field>
                    )}
                  />
                  {selectedMappingBehavior === IntegrationMappingBehavior.MANY_TO_ONE && (
                    <Controller
                      control={control}
                      name="secretName"
                      render={({ field, fieldState: { error } }) => (
                        <Field className="mb-4" data-invalid={Boolean(error)}>
                          <FieldLabel htmlFor="awssecretmanager-secretname">
                            AWS SM Secret Name
                          </FieldLabel>
                          <Input
                            placeholder={`${currentProject.name
                              .toLowerCase()
                              .replace(/ /g, "-")}/${selectedSourceEnvironment}`}
                            {...field}
                            id="awssecretmanager-secretname"
                            isError={Boolean(error)}
                            aria-describedby={
                              error ? "awssecretmanager-secretname-error" : undefined
                            }
                          />
                          {Boolean(error) && (
                            <FieldError id="awssecretmanager-secretname-error">
                              {error?.message}
                            </FieldError>
                          )}
                        </Field>
                      )}
                    />
                  )}
                </motion.div>
              </TabsContent>
              <TabsContent value={TabSections.Options}>
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
                        <Field orientation="horizontal">
                          <FieldLabel htmlFor="tag-aws">Tag in AWS Secrets Manager</FieldLabel>
                          <Toggle
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
                            checked={value}
                            variant="project"
                          />
                        </Field>
                      )}
                    />
                  </div>
                  {shouldTagState &&
                    selectedMappingBehavior === IntegrationMappingBehavior.ONE_TO_ONE && (
                      <Controller
                        control={control}
                        name="metadataSyncMode"
                        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                          <Field className="mb-4" data-invalid={Boolean(error)}>
                            <FieldLabel htmlFor="awssecretmanager-metadatasyncmode">
                              Tag Sync Mode
                            </FieldLabel>
                            <Select
                              defaultValue={field.value}
                              onValueChange={(e) => {
                                setValue("tags", []);
                                onChange(e);
                              }}
                            >
                              <SelectTrigger
                                className="w-full"
                                id="awssecretmanager-metadatasyncmode"
                                isError={Boolean(error)}
                                aria-describedby={
                                  error ? "awssecretmanager-metadatasyncmode-error" : undefined
                                }
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem
                                  value={IntegrationMetadataSyncMode.SECRET_METADATA}
                                  key={`sync-mode-${IntegrationMetadataSyncMode.SECRET_METADATA}`}
                                >
                                  Secret Metadata
                                </SelectItem>
                                <SelectItem
                                  value={IntegrationMetadataSyncMode.CUSTOM}
                                  key={`sync-mode-${IntegrationMetadataSyncMode.CUSTOM}`}
                                >
                                  Custom
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {Boolean(error) && (
                              <FieldError id="awssecretmanager-metadatasyncmode-error">
                                {error?.message}
                              </FieldError>
                            )}
                          </Field>
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
                            <Field className="mb-4" data-invalid={Boolean(error)}>
                              <FieldLabel htmlFor="awssecretmanager-tags-0-key">Tag Key</FieldLabel>
                              <Input
                                placeholder="managed-by"
                                {...field}
                                id="awssecretmanager-tags-0-key"
                                isError={Boolean(error)}
                                aria-describedby={
                                  error ? "awssecretmanager-tags-0-key-error" : undefined
                                }
                              />
                              {Boolean(error) && (
                                <FieldError id="awssecretmanager-tags-0-key-error">
                                  {error?.message}
                                </FieldError>
                              )}
                            </Field>
                          )}
                        />
                        <Controller
                          control={control}
                          name="tags.0.value"
                          render={({ field, fieldState: { error } }) => (
                            <Field className="mb-4" data-invalid={Boolean(error)}>
                              <FieldLabel htmlFor="awssecretmanager-tags-0-value">
                                Tag Value
                              </FieldLabel>
                              <Input
                                placeholder="infisical"
                                {...field}
                                id="awssecretmanager-tags-0-value"
                                isError={Boolean(error)}
                                aria-describedby={
                                  error ? "awssecretmanager-tags-0-value-error" : undefined
                                }
                              />
                              {Boolean(error) && (
                                <FieldError id="awssecretmanager-tags-0-value-error">
                                  {error?.message}
                                </FieldError>
                              )}
                            </Field>
                          )}
                        />
                      </div>
                    )}
                  <Controller
                    control={control}
                    name="secretPrefix"
                    render={({ field, fieldState: { error } }) => (
                      <Field className="mt-4 mb-4" data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="awssecretmanager-secretprefix">
                          Secret Prefix
                        </FieldLabel>
                        <Input
                          placeholder="INFISICAL_"
                          {...field}
                          id="awssecretmanager-secretprefix"
                          isError={Boolean(error)}
                          aria-describedby={
                            error ? "awssecretmanager-secretprefix-error" : undefined
                          }
                        />
                        {Boolean(error) && (
                          <FieldError id="awssecretmanager-secretprefix-error">
                            {error?.message}
                          </FieldError>
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    control={control}
                    name="kmsKeyId"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <Field className="mb-4" data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="awssecretmanager-kmskeyid">Encryption Key</FieldLabel>
                        <Select defaultValue={field.value} onValueChange={(e) => onChange(e)}>
                          <SelectTrigger
                            className="w-full"
                            id="awssecretmanager-kmskeyid"
                            isError={Boolean(error)}
                            aria-describedby={error ? "awssecretmanager-kmskeyid-error" : undefined}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {integrationAuthAwsKmsKeys?.length ? (
                              integrationAuthAwsKmsKeys.map((key) => {
                                return (
                                  <SelectItem value={key.id as string} key={`repo-id-${key.id}`}>
                                    {key.alias}
                                  </SelectItem>
                                );
                              })
                            ) : (
                              <SelectItem disabled value="no-keys" key="no-keys">
                                No KMS keys available
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {Boolean(error) && (
                          <FieldError id="awssecretmanager-kmskeyid-error">
                            {error?.message}
                          </FieldError>
                        )}
                      </Field>
                    )}
                  />
                </motion.div>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" isPending={isSubmitting} variant="project">
              Create Integration
            </Button>
          </CardFooter>
        </Card>
        <div className="mt-6 w-full max-w-md border-t border-border-faint" />
        <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-border-control bg-surface-raised p-4">
          <div className="flex flex-row items-center">
            <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-foreground-secondary" />{" "}
            <span className="text-md ml-3 text-foreground">Pro Tip</span>
          </div>
          <span className="mt-4 text-sm text-label">
            After creating an integration, your secrets will start syncing immediately. This might
            cause an unexpected override of current secrets in AWS Secrets Manager with secrets from
            Infisical.
          </span>
        </div>
      </form>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up AWS Secrets Manager Integration" />
      {isintegrationAuthLoading || isIntegrationAuthAwsKmsKeysLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-border-control bg-surface-raised p-6 text-center text-foreground-secondary">
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-foreground underline decoration-project underline-offset-4 opacity-80 duration-200 hover:opacity-100"
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
