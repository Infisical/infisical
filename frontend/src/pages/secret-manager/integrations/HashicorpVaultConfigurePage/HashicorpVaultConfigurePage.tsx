import { useMemo } from "react";
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
import { z } from "zod";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { isValidPath } from "@app/helpers/string";
import { useCreateIntegration } from "@app/hooks/api";
import { useGetIntegrationAuthById } from "@app/hooks/api/integrationAuth";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const generateFormSchema = (availableEnvironmentNames: string[]) => {
  return z.object({
    secretPath: z
      .string()
      .min(1)
      .refine((val) => isValidPath(val), {
        message: "Vault secret path has to be a valid path"
      }),
    vaultEnginePath: z
      .string()
      .min(1)
      .refine((val) => isValidPath(val), {
        message: "Vault engine path has to be a valid path"
      }),
    vaultSecretPath: z
      .string()
      .min(1)
      .refine((val) => isValidPath(val), {
        message: "Vault secret path has to be a valid path"
      }),
    selectedSourceEnvironment: z.enum(availableEnvironmentNames as any as [string, ...string[]])
  });
};

type TForm = z.infer<ReturnType<typeof generateFormSchema>>;

export const HashicorpVaultConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.HashicorpVaultConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth, isPending: isintegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );

  const formSchema = useMemo(() => {
    return generateFormSchema(currentProject?.environments.map((env) => env.slug) ?? []);
  }, [currentProject?.environments]);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      secretPath: "/",
      vaultEnginePath: "",
      vaultSecretPath: "",
      selectedSourceEnvironment: ""
    }
  });

  const handleFormSubmit = async (formData: TForm) => {
    if (!integrationAuth?.id) return;
    await mutateAsync({
      integrationAuthId: integrationAuth?.id,
      isActive: true,
      app: formData.vaultEnginePath,
      sourceEnvironment: formData.selectedSourceEnvironment,
      path: formData.vaultSecretPath,
      secretPath: formData.secretPath
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
  };

  return integrationAuth ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Helmet>
        <title>Set Up Vault Integration</title>
      </Helmet>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <div className="flex flex-row items-center">
              <div className="inline-flex items-center">
                <img
                  src="/images/integrations/Vault.png"
                  height={30}
                  width={30}
                  alt="HCP Vault logo"
                />
              </div>
              <span className="ml-2.5">HashiCorp Vault Integration</span>
              <a
                href="https://infisical.com/docs/integrations/cloud/hashicorp-vault"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-warning/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-warning opacity-80 hover:opacity-100">
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
          <CardDescription>
            Select which environment or folder in Infisical you want to sync to which path in
            HashiCorp Vault.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(handleFormSubmit)} noValidate>
            <Controller
              control={control}
              name="selectedSourceEnvironment"
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HashicorpVaultConfigurePage-field-1">
                    Project Environment
                    <span className="text-danger">*</span>
                  </FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="HashicorpVaultConfigurePage-field-1"
                      aria-describedby="HashicorpVaultConfigurePage-field-1-feedback"
                      isError={Boolean(error)}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentProject?.environments.map((sourceEnvironment) => (
                        <SelectItem
                          value={sourceEnvironment.slug}
                          key={`vault-environment-${sourceEnvironment.slug}`}
                        >
                          {sourceEnvironment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {Boolean(error) && (
                    <FieldError id="HashicorpVaultConfigurePage-field-1-feedback">
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
                  <FieldLabel htmlFor="HashicorpVaultConfigurePage-field-2">
                    Secrets Path
                    <span className="text-danger">*</span>
                  </FieldLabel>
                  <Input
                    id="HashicorpVaultConfigurePage-field-2"
                    aria-required
                    aria-describedby="HashicorpVaultConfigurePage-field-2-feedback"
                    isError={Boolean(error)}
                    {...field}
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="/"
                  />
                  {!error && (
                    <FieldDescription id="HashicorpVaultConfigurePage-field-2-feedback">
                      A path to your secrets in Infisical.
                    </FieldDescription>
                  )}
                  {Boolean(error) && (
                    <FieldError id="HashicorpVaultConfigurePage-field-2-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />

            <Controller
              control={control}
              name="vaultEnginePath"
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HashicorpVaultConfigurePage-field-3">
                    Vault KV Secrets Engine Path
                    <span className="text-danger">*</span>
                  </FieldLabel>
                  <Input
                    id="HashicorpVaultConfigurePage-field-3"
                    aria-required
                    aria-describedby="HashicorpVaultConfigurePage-field-3-feedback"
                    isError={Boolean(error)}
                    autoCorrect="off"
                    spellCheck={false}
                    {...field}
                    placeholder="kv"
                  />
                  {!error && (
                    <FieldDescription id="HashicorpVaultConfigurePage-field-3-feedback">
                      A path where your KV Secrets Engine is enabled.
                    </FieldDescription>
                  )}
                  {Boolean(error) && (
                    <FieldError id="HashicorpVaultConfigurePage-field-3-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />

            <Controller
              control={control}
              name="vaultSecretPath"
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HashicorpVaultConfigurePage-field-4">
                    Vault Secret(s) Path
                    <span className="text-danger">*</span>
                  </FieldLabel>
                  <Input
                    id="HashicorpVaultConfigurePage-field-4"
                    aria-required
                    aria-describedby="HashicorpVaultConfigurePage-field-4-feedback"
                    isError={Boolean(error)}
                    autoCorrect="off"
                    spellCheck={false}
                    {...field}
                    placeholder="machine/dev"
                  />
                  {!error && (
                    <FieldDescription id="HashicorpVaultConfigurePage-field-4-feedback">
                      A path for storing secrets within the KV Secrets Engine.
                    </FieldDescription>
                  )}
                  {Boolean(error) && (
                    <FieldError id="HashicorpVaultConfigurePage-field-4-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />

            <Button type="submit" isPending={isSubmitting} variant="project">
              Create Integration
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-6 w-full max-w-md border-t border-border-faint" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-border-control bg-surface-raised p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-foreground-secondary" />{" "}
          <span className="text-md ml-3 text-foreground">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-label">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in Vault with secrets from Infisical.
        </span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Set Up Vault Integration</title>
      </Helmet>
      {isintegrationAuthLoading ? (
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
