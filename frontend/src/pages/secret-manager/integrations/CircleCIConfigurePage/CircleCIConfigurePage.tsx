import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardTitle,
  FilterableSelect,
  FormControl,
  Select,
  SelectItem,
  Spinner
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
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
        <Spinner />
      </div>
    );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex h-full w-full items-center justify-center"
    >
      <Card className="max-w-lg rounded-md p-8 pt-4">
        <CardTitle
          className="w-full px-0 text-left text-xl"
          subTitle="Choose which environment or folder in Infisical you want to sync to CircleCI."
        >
          <div className="flex w-full flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-1.5">
              <img
                src="/images/integrations/CircleCI.png"
                height={30}
                width={30}
                alt="CircleCI logo"
              />

              <span className="">CircleCI Context Integration </span>
            </div>

            <a
              href="https://infisical.com/docs/integrations/cicd/circleci"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 flex cursor-pointer flex-row items-center gap-0.5 rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
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
        <Controller
          control={control}
          name="sourceEnvironment"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error)}
              label="Project Environment"
            >
              <FilterableSelect
                getOptionValue={(option) => option.slug}
                value={value}
                getOptionLabel={(option) => option.name}
                onChange={onChange}
                options={currentProject?.environments}
                placeholder="Select a project environment"
                isDisabled={!currentProject?.environments.length}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="secretPath"
          render={({ field, fieldState: { error } }) => (
            <FormControl label="Secrets Path" errorText={error?.message} isError={Boolean(error)}>
              <SecretPathInput {...field} environment={selectedEnvironment.slug} />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="targetOrg"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error)}
              label="CircleCI Organization"
            >
              <FilterableSelect
                getOptionValue={(option) => option.slug}
                value={value}
                getOptionLabel={(option) => option.name}
                onChange={(e) => {
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
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="scope"
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl label="Scope" errorText={error?.message} isError={Boolean(error)}>
              <Select
                defaultValue={field.value}
                onValueChange={(e) => {
                  onChange(e);
                }}
                className="w-full border border-mineshaft-500"
              >
                <SelectItem value={CircleCiScope.Project}>Project</SelectItem>
                <SelectItem value={CircleCiScope.Context}>Context</SelectItem>
              </Select>
            </FormControl>
          )}
        />
        {selectedScope === CircleCiScope.Context && selectedOrganizationEntry && (
          <Controller
            control={control}
            name="targetContext"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                label="CircleCI Context"
              >
                <FilterableSelect
                  value={value}
                  getOptionValue={(option) => option.id!}
                  getOptionLabel={(option) => option.name}
                  onChange={onChange}
                  options={selectedOrganizationEntry?.contexts}
                  placeholder={
                    selectedOrganizationEntry.contexts?.length
                      ? "Select a context..."
                      : "No contexts found..."
                  }
                  isDisabled={!selectedOrganizationEntry.contexts?.length}
                />
              </FormControl>
            )}
          />
        )}
        {selectedScope === CircleCiScope.Project && selectedOrganizationEntry && (
          <Controller
            control={control}
            name="targetProject"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                label="CircleCI Project"
              >
                <FilterableSelect
                  value={value}
                  getOptionValue={(option) => option.id!}
                  getOptionLabel={(option) => option.name}
                  onChange={onChange}
                  options={selectedOrganizationEntry?.projects}
                  placeholder={
                    selectedOrganizationEntry.projects?.length
                      ? "Select a project..."
                      : "No projects found..."
                  }
                  isDisabled={!selectedOrganizationEntry.projects?.length}
                />
              </FormControl>
            )}
          />
        )}
        <Button
          type="submit"
          colorSchema="primary"
          className="mt-4"
          isLoading={isCreatingIntegration}
          isDisabled={isCreatingIntegration}
        >
          Create Integration
        </Button>
      </Card>
    </form>
  );
};
