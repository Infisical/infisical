import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
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
    <div className="flex h-full w-full flex-col items-center justify-center gap-6">
      <PageTitle title="Set Up Vault Integration" />
      <form onSubmit={handleSubmit(handleFormSubmit)} noValidate className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>
              <img
                src="/images/integrations/Vault.png"
                height={30}
                width={30}
                alt="HCP Vault logo"
              />
              HashiCorp Vault Integration
              <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/hashicorp-vault" />
            </CardTitle>
            <CardDescription>
              Select which environment or folder in Infisical you want to sync to which path in
              HashiCorp Vault.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Controller
              control={control}
              name="selectedSourceEnvironment"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
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
                <Field data-invalid={Boolean(error)}>
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
                <Field data-invalid={Boolean(error)}>
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
                <Field data-invalid={Boolean(error)}>
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
          </CardContent>
          <CardFooter className="justify-end border-t pt-4">
            <Button type="submit" isPending={isSubmitting} variant="project">
              Create Integration
            </Button>
          </CardFooter>
        </Card>
      </form>
      <Alert variant="info" className="w-full max-w-lg">
        <InfoIcon />
        <AlertTitle>Pro Tip</AlertTitle>
        <AlertDescription>
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in Vault with secrets from Infisical.
        </AlertDescription>
      </Alert>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Vault Integration" />
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
