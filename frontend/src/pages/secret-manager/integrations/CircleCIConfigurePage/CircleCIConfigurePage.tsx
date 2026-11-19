import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
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
  Combobox,
  Field,
  FieldError,
  FieldLabel,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration, useGetIntegrationAuthCircleCIOrganizations } from "@app/hooks/api";
import { CircleCiScope } from "@app/hooks/api/integrationAuth/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const formSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(CircleCiScope.Context),
    secretPath: z.string().default("/"),
    sourceEnvironment: z.object({ name: z.string(), slug: z.string() }),
    targetOrg: z.object({ name: z.string().min(1), slug: z.string().min(1) }),
    targetContext: z.object({ name: z.string().min(1), id: z.string().min(1) })
  }),
  z.object({
    scope: z.literal(CircleCiScope.Project),
    secretPath: z.string().default("/"),
    sourceEnvironment: z.object({ name: z.string(), slug: z.string() }),
    targetOrg: z.object({ name: z.string().min(1), slug: z.string().min(1) }),
    targetProject: z.object({ name: z.string().min(1), id: z.string().min(1) })
  })
]);

type TFormData = z.infer<typeof formSchema>;

export const CircleCIConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending: isCreatingIntegration } = useCreateIntegration();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.CircleConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { control, watch, handleSubmit, setValue } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      secretPath: "/",
      sourceEnvironment: currentProject?.environments[0],
      scope: CircleCiScope.Project
    }
  });

  const selectedScope = watch("scope");
  const selectedOrg = watch("targetOrg");
  const selectedEnvironment = watch("sourceEnvironment");

  const { data: circleCIOrganizations, isPending: isCircleCIOrganizationsLoading } =
    useGetIntegrationAuthCircleCIOrganizations(integrationAuthId);

  const selectedOrganizationEntry = selectedOrg
    ? circleCIOrganizations?.find((org) => org.slug === selectedOrg.slug)
    : undefined;

  const onSubmit = async (data: TFormData) => {
    if (data.scope === CircleCiScope.Context) {
      await mutateAsync({
        scope: data.scope,
        integrationAuthId,
        isActive: true,
        sourceEnvironment: data.sourceEnvironment.slug,
        app: data.targetContext.name,
        appId: data.targetContext.id,
        owner: data.targetOrg.name,
        secretPath: data.secretPath
      });
    } else {
      await mutateAsync({
        scope: data.scope,
        integrationAuthId,
        isActive: true,
        app: data.targetProject.name, // project name
        owner: data.targetOrg.name, // organization name
        appId: data.targetProject.id, // project id (used for syncing)
        sourceEnvironment: data.sourceEnvironment.slug,
        secretPath: data.secretPath
      });
    }

    createNotification({
      type: "success",
      text: "Successfully created integration"
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

  if (isCircleCIOrganizationsLoading)
    return (
      <div className="flex h-full w-full items-center justify-center p-24">
        <PageTitle title="Set Up CircleCI Integration" />
        <Spinner />
      </div>
    );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex h-full w-full items-center justify-center"
    >
      <PageTitle title="Set Up CircleCI Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/CircleCI.png"
              height={30}
              width={30}
              alt="CircleCI logo"
            />
            <span>CircleCI Context Integration</span>
          </CardTitle>
          <CardDescription>
            Choose which environment or folder in Infisical you want to sync to CircleCI.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                href="https://infisical.com/docs/integrations/cicd/circleci"
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
          <Controller
            control={control}
            name="sourceEnvironment"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="circleci-sourceenvironment">Project Environment</FieldLabel>
                <Combobox
                  includeMissingSelectedOptions={false}
                  isClearable={false}
                  getOptionValue={(option) => option.slug}
                  value={value}
                  getOptionLabel={(option) => option.name}
                  onValueChange={onChange}
                  options={currentProject?.environments}
                  placeholder="Select a project environment"
                  isDisabled={!currentProject?.environments.length}
                  id="circleci-sourceenvironment"
                  isError={Boolean(error)}
                  aria-describedby={error ? "circleci-sourceenvironment-error" : undefined}
                />
                {Boolean(error) && (
                  <FieldError id="circleci-sourceenvironment-error">{error?.message}</FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="secretPath"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="circleci-secretpath">Secrets Path</FieldLabel>
                <SecretPathInput
                  {...field}
                  environment={selectedEnvironment.slug}
                  id="circleci-secretpath"
                  isError={Boolean(error)}
                  aria-describedby={error ? "circleci-secretpath-error" : undefined}
                />
                {Boolean(error) && (
                  <FieldError id="circleci-secretpath-error">{error?.message}</FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="targetOrg"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="circleci-targetorg">CircleCI Organization</FieldLabel>
                <Combobox
                  includeMissingSelectedOptions={false}
                  isClearable={false}
                  getOptionValue={(option) => option.slug}
                  value={value}
                  getOptionLabel={(option) => option.name}
                  onValueChange={(e) => {
                    setValue("targetProject", {
                      name: "",
                      id: ""
                    });
                    setValue("targetContext", {
                      name: "",
                      id: ""
                    });

                    onChange(e);
                  }}
                  options={circleCIOrganizations}
                  placeholder={
                    circleCIOrganizations?.length
                      ? "Select an organization..."
                      : "No organizations found..."
                  }
                  isDisabled={!circleCIOrganizations?.length}
                  id="circleci-targetorg"
                  isError={Boolean(error)}
                  aria-describedby={error ? "circleci-targetorg-error" : undefined}
                />
                {Boolean(error) && (
                  <FieldError id="circleci-targetorg-error">{error?.message}</FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="scope"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="circleci-scope">Scope</FieldLabel>
                <Select
                  defaultValue={field.value}
                  onValueChange={(e) => {
                    onChange(e);
                  }}
                >
                  <SelectTrigger
                    className="w-full"
                    id="circleci-scope"
                    isError={Boolean(error)}
                    aria-describedby={error ? "circleci-scope-error" : undefined}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CircleCiScope.Project}>Project</SelectItem>
                    <SelectItem value={CircleCiScope.Context}>Context</SelectItem>
                  </SelectContent>
                </Select>
                {Boolean(error) && (
                  <FieldError id="circleci-scope-error">{error?.message}</FieldError>
                )}
              </Field>
            )}
          />
          {selectedScope === CircleCiScope.Context && selectedOrganizationEntry && (
            <Controller
              control={control}
              name="targetContext"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="circleci-targetcontext">CircleCI Context</FieldLabel>
                  <Combobox
                    includeMissingSelectedOptions={false}
                    isClearable={false}
                    value={value}
                    getOptionValue={(option) => option.id!}
                    getOptionLabel={(option) => option.name}
                    onValueChange={onChange}
                    options={selectedOrganizationEntry?.contexts}
                    placeholder={
                      selectedOrganizationEntry.contexts?.length
                        ? "Select a context..."
                        : "No contexts found..."
                    }
                    isDisabled={!selectedOrganizationEntry.contexts?.length}
                    id="circleci-targetcontext"
                    isError={Boolean(error)}
                    aria-describedby={error ? "circleci-targetcontext-error" : undefined}
                  />
                  {Boolean(error) && (
                    <FieldError id="circleci-targetcontext-error">{error?.message}</FieldError>
                  )}
                </Field>
              )}
            />
          )}
          {selectedScope === CircleCiScope.Project && selectedOrganizationEntry && (
            <Controller
              control={control}
              name="targetProject"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="circleci-targetproject">CircleCI Project</FieldLabel>
                  <Combobox
                    includeMissingSelectedOptions={false}
                    isClearable={false}
                    value={value}
                    getOptionValue={(option) => option.id!}
                    getOptionLabel={(option) => option.name}
                    onValueChange={onChange}
                    options={selectedOrganizationEntry?.projects}
                    placeholder={
                      selectedOrganizationEntry.projects?.length
                        ? "Select a project..."
                        : "No projects found..."
                    }
                    isDisabled={!selectedOrganizationEntry.projects?.length}
                    id="circleci-targetproject"
                    isError={Boolean(error)}
                    aria-describedby={error ? "circleci-targetproject-error" : undefined}
                  />
                  {Boolean(error) && (
                    <FieldError id="circleci-targetproject-error">{error?.message}</FieldError>
                  )}
                </Field>
              )}
            />
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            type="submit"
            isPending={isCreatingIntegration}
            isDisabled={isCreatingIntegration}
            variant="project"
          >
            Create Integration
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};
