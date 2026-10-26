import { Controller, useForm } from "react-hook-form";
import { faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
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
      <PageTitle title="Set Up Rundeck Integration" />
      <form onSubmit={handleSubmit(onFormSubmit)} className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>
              <img
                src="/images/integrations/Rundeck.svg"
                height={30}
                width={30}
                alt="Rundeck logo"
              />
              Rundeck Integration
              <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/flyio" />
            </CardTitle>
            <CardDescription>
              Choose which environment or folder in Infisical you want to sync to the Rundeck Key
              Storage.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Controller
              control={control}
              name="sourceEnvironment"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="RundeckConfigurePage-field-1">
                    Project Environment
                  </FieldLabel>
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
                <Field data-invalid={Boolean(error)}>
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
                <Field data-invalid={Boolean(error)}>
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
          </CardContent>
          <CardFooter className="justify-end border-t pt-4">
            <Button type="submit" isPending={isSubmitting} variant="project">
              Create Integration
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up Rundeck Integration" />
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
