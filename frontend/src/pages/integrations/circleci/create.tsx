import { Controller, useForm } from "react-hook-form";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useWorkspace } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import { useGetIntegrationAuthCircleCIOrganizations } from "@app/hooks/api/integrationAuth";

const formSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("context"),
    secretPath: z.string().default("/"),
    sourceEnvironment: z.object({ name: z.string(), slug: z.string() }),
    targetOrg: z.object({ name: z.string().min(1), slug: z.string().min(1) }),
    targetContext: z.object({ name: z.string().min(1), id: z.string().min(1) })
  }),
  z.object({
    scope: z.literal("project"),
    secretPath: z.string().default("/"),
    sourceEnvironment: z.object({ name: z.string(), slug: z.string() }),
    targetOrg: z.object({ name: z.string().min(1), slug: z.string().min(1) }),
    targetProject: z.object({ name: z.string().min(1), id: z.string().min(1) })
  })
]);

type TFormData = z.infer<typeof formSchema>;

export default function CircleCICreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync, isLoading: isCreatingIntegration } = useCreateIntegration();
  const { currentWorkspace, isLoading: isProjectLoading } = useWorkspace();

  const integrationAuthId = router.query.integrationAuthId as string;

  const { control, watch, handleSubmit, setValue } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      secretPath: "/",
      sourceEnvironment: currentWorkspace?.environments[0]
    }
  });

  const selectedScope = watch("scope");
  const selectedOrg = watch("targetOrg");

  const { data: circleCIOrganizations, isLoading: isCircleCIOrganizationsLoading } =
    useGetIntegrationAuthCircleCIOrganizations(integrationAuthId);

  const selectedOrganizationEntry = selectedOrg
    ? circleCIOrganizations?.find((org) => org.slug === selectedOrg.slug)
    : undefined;

  const onSubmit = async (data: TFormData) => {
    try {
      if (data.scope === "context") {
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
      router.push(`/integrations/${currentWorkspace?.id}`);
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to create integration"
      });
      console.error(err);
    }
  };

  if (isProjectLoading || isCircleCIOrganizationsLoading)
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
              <Image
                src="/images/integrations/CircleCI.png"
                height={30}
                width={30}
                alt="CircleCI logo"
              />

              <span className="">CircleCI Context Integration </span>
            </div>

            <Link
              href="https://infisical.com/docs/integrations/cicd/circleci"
              target="_blank"
              rel="noopener noreferrer"
              passHref
            >
              <div className="ml-2 mb-1 flex cursor-pointer flex-row items-center gap-0.5 rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="ml-1.5 mb-[0.07rem] text-xxs"
                />
              </div>
            </Link>
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
                options={currentWorkspace?.environments}
                placeholder="Select a project environment"
                isDisabled={!currentWorkspace?.environments.length}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="secretPath"
          render={({ field, fieldState: { error } }) => (
            <FormControl label="Secrets Path" errorText={error?.message} isError={Boolean(error)}>
              <SecretPathInput {...field} />
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
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="context">Context</SelectItem>
              </Select>
            </FormControl>
          )}
        />
        {selectedScope === "context" && selectedOrganizationEntry && (
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
        {selectedScope === "project" && selectedOrganizationEntry && (
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
}

CircleCICreateIntegrationPage.requireAuth = true;
