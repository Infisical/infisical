import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import { useGetIntegrationAuthById } from "@app/hooks/api/integrationAuth";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const schema = z.object({
  keyStoragePath: z.string().trim().min(1, { message: "Rundeck Key Storage path is required" }),
  secretPath: z.string().trim().min(1, { message: "Secret path is required" }),
  sourceEnvironment: z.string().trim().min(1, { message: "Source environment is required" })
});

type TFormSchema = z.infer<typeof schema>;

export const RundeckConfigurePage = () => {
  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(schema),
    defaultValues: {
      secretPath: "/"
    }
  });
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.RundeckConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth, isPending: isIntegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );

  const selectedSourceEnvironment = watch("sourceEnvironment");

  const onFormSubmit = async ({ secretPath, sourceEnvironment, keyStoragePath }: TFormSchema) => {
    try {
      if (!integrationAuth?.id) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        path: keyStoragePath,
        sourceEnvironment,
        url: integrationAuth.url,
        secretPath
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

  return integrationAuth ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Helmet>
        <title>Set Up Rundeck Integration</title>
      </Helmet>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <div className="flex flex-row items-center">
              <div className="flex items-center pb-0.5">
                <img
                  src="/images/integrations/Rundeck.svg"
                  height={30}
                  width={30}
                  alt="Rundeck logo"
                />
              </div>
              <span className="ml-2.5">Rundeck Integration </span>
              <a
                href="https://infisical.com/docs/integrations/cloud/flyio"
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
            Choose which environment or folder in Infisical you want to sync to the Rundeck Key
            Storage.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex w-full flex-col px-6">
          <Controller
            control={control}
            name="sourceEnvironment"
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4" data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="RundeckConfigurePage-field-1">Project Environment</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={(val) => {
                    field.onChange(val);
                  }}
                >
                  <SelectTrigger
                    id="RundeckConfigurePage-field-1"
                    aria-describedby="RundeckConfigurePage-field-1-feedback"
                    isError={Boolean(error)}
                    className="w-full"
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
                  <FieldError id="RundeckConfigurePage-field-1-feedback">
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
                <FieldLabel htmlFor="RundeckConfigurePage-field-2">Secrets Path</FieldLabel>
                <SecretPathInput
                  id="RundeckConfigurePage-field-2"
                  aria-describedby="RundeckConfigurePage-field-2-feedback"
                  isError={Boolean(error)}
                  {...field}
                  environment={selectedSourceEnvironment}
                />
                {Boolean(error) && (
                  <FieldError id="RundeckConfigurePage-field-2-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />

          <Controller
            control={control}
            name="keyStoragePath"
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4" data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="RundeckConfigurePage-field-3">
                  Rundeck Key Storage Path
                </FieldLabel>
                <Input
                  id="RundeckConfigurePage-field-3"
                  aria-describedby="RundeckConfigurePage-field-3-feedback"
                  isError={Boolean(error)}
                  placeholder={`keys/project/${currentProject.name
                    .toLowerCase()
                    .replace(/ /g, "-")}/${selectedSourceEnvironment}`}
                  {...field}
                />
                {Boolean(error) && (
                  <FieldError id="RundeckConfigurePage-field-3-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />

          <Button
            type="submit"
            className="mt-2 mb-6 ml-auto"
            isPending={isSubmitting}
            variant="project"
          >
            Create Integration
          </Button>
        </form>
      </Card>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Set Up Rundeck Integration</title>
      </Helmet>
      {isIntegrationAuthLoading ? (
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
