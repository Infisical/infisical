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
  CardBody,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
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
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Select which environment or folder in Infisical you want to sync to which path in HashiCorp Vault."
        >
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
        <CardBody>
          <form onSubmit={handleSubmit(handleFormSubmit)} noValidate>
            <Controller
              control={control}
              name="selectedSourceEnvironment"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired
                  label="Project Environment"
                >
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    className="w-full border border-mineshaft-500"
                  >
                    {currentProject?.environments.map((sourceEnvironment) => (
                      <SelectItem
                        value={sourceEnvironment.slug}
                        key={`vault-environment-${sourceEnvironment.slug}`}
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
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired
                  label="Secrets Path"
                  helperText="A path to your secrets in Infisical."
                >
                  <Input {...field} autoCorrect="off" spellCheck={false} placeholder="/" />
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="vaultEnginePath"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Vault KV Secrets Engine Path"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  helperText="A path where your KV Secrets Engine is enabled."
                  isRequired
                >
                  <Input autoCorrect="off" spellCheck={false} {...field} placeholder="kv" />
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="vaultSecretPath"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Vault Secret(s) Path"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  helperText="A path for storing secrets within the KV Secrets Engine."
                  isRequired
                >
                  <Input
                    autoCorrect="off"
                    spellCheck={false}
                    {...field}
                    placeholder="machine/dev"
                  />
                </FormControl>
              )}
            />

            <Button type="submit" isLoading={isSubmitting}>
              Create Integration
            </Button>
          </form>
        </CardBody>
      </Card>
      <div className="mt-6 w-full max-w-md border-t border-mineshaft-800" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-mineshaft-200" />{" "}
          <span className="text-md ml-3 text-mineshaft-100">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-mineshaft-300">
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
