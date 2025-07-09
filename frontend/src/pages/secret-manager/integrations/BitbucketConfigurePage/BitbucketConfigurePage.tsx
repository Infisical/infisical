import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { SiBitbucket } from "react-icons/si";
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
  Input,
  Spinner
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useWorkspace } from "@app/context";
import {
  useCreateIntegration,
  useGetIntegrationAuthApps,
  useGetIntegrationAuthBitbucketWorkspaces
} from "@app/hooks/api";
import { useGetIntegrationAuthBitbucketEnvironments } from "@app/hooks/api/integrationAuth/queries";
import { IntegrationsListPageTabs } from "@app/types/integrations";

enum BitbucketScope {
  Repo = "repo",
  Env = "environment"
}

const ScopeOptions = [
  {
    label: "Repository",
    value: BitbucketScope.Repo
  },
  {
    label: "Deployment Environment",
    value: BitbucketScope.Env
  }
];

const formSchema = z
  .object({
    secretPath: z.string().default("/"),
    sourceEnvironment: z.object({ name: z.string(), slug: z.string() }),
    targetRepo: z.object({ name: z.string(), appId: z.string().optional() }).nullish(),
    targetWorkspace: z.object({ name: z.string(), slug: z.string() }),
    targetEnvironment: z.object({ name: z.string(), uuid: z.string() }).nullish(),
    scope: z.object({ label: z.string(), value: z.nativeEnum(BitbucketScope) })
  })
  .superRefine((val, ctx) => {
    if (!val.targetWorkspace) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetWorkspace"],
        message: "Bitbucket Workspace required"
      });
    }

    if (!val.targetRepo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetRepo"],
        message: "Bitbucket Repo required"
      });
    }

    if (val.scope.value === BitbucketScope.Env && !val.targetEnvironment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetEnvironment"],
        message: "Bitbucket Deployment Environment required"
      });
    }
  });

type TFormData = z.infer<typeof formSchema>;

export const BitbucketConfigurePage = () => {
  const navigate = useNavigate();
  const createIntegration = useCreateIntegration();

  const { watch, control, handleSubmit, setValue, reset } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      secretPath: "/"
    }
  });

  const bitbucketWorkspace = watch("targetWorkspace");
  const bitbucketRepo = watch("targetRepo");

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.BitbucketConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { currentWorkspace } = useWorkspace();

  const { data: bitbucketWorkspaces, isPending: isBitbucketWorkspacesLoading } =
    useGetIntegrationAuthBitbucketWorkspaces((integrationAuthId as string) ?? "");

  const { data: bitbucketRepos, isPending: isBitbucketReposLoading } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? "",
    workspaceSlug: bitbucketWorkspace?.slug
  });

  const { data: bitbucketEnvironments, isPending: isBitbucketEnvironmentsLoading } =
    useGetIntegrationAuthBitbucketEnvironments(
      {
        integrationAuthId: (integrationAuthId as string) ?? "",
        workspaceSlug: bitbucketWorkspace?.slug ?? "",
        repoSlug: bitbucketRepo?.appId ?? ""
      },
      { enabled: Boolean(bitbucketWorkspace?.slug && bitbucketRepo?.appId) }
    );

  const onSubmit = async ({
    targetRepo,
    sourceEnvironment,
    targetWorkspace,
    secretPath,
    targetEnvironment,
    scope
  }: TFormData) => {
    if (!targetRepo || !targetWorkspace) return;

    try {
      await createIntegration.mutateAsync({
        integrationAuthId,
        isActive: true,
        app: targetRepo.name,
        appId: targetRepo.appId,
        sourceEnvironment: sourceEnvironment.slug,
        targetEnvironment: targetWorkspace.name,
        targetEnvironmentId: targetWorkspace.slug,
        ...(scope.value === BitbucketScope.Env &&
          targetEnvironment && {
            targetService: targetEnvironment.name,
            targetServiceId: targetEnvironment.uuid
          }),
        secretPath
      });

      createNotification({
        type: "success",
        text: "Successfully created integration"
      });
      navigate({
        to: "/projects/$projectId/secret-manager/integrations",
        params: {
          projectId: currentWorkspace.id
        },
        search: {
          selectedTab: IntegrationsListPageTabs.NativeIntegrations
        }
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to create integration"
      });
      console.error(err);
    }
  };

  useEffect(() => {
    if (
      bitbucketWorkspace ||
      bitbucketRepo ||
      !bitbucketRepos ||
      !bitbucketWorkspaces ||
      !currentWorkspace
    )
      return;

    reset({
      targetRepo: bitbucketRepos[0],
      targetWorkspace: bitbucketWorkspaces[0],
      sourceEnvironment: currentWorkspace.environments[0],
      secretPath: "/",
      scope: ScopeOptions[0]
    });
  }, [bitbucketWorkspaces, bitbucketRepos, currentWorkspace]);

  if (isBitbucketWorkspacesLoading || isBitbucketReposLoading)
    return (
      <div className="flex h-full w-full items-center justify-center p-24">
        <Spinner />
      </div>
    );

  const scope = watch("scope");

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex h-full w-full items-center justify-center"
    >
      <Card className="max-w-md rounded-md p-8 pt-4">
        <CardTitle className="text-center">
          <SiBitbucket size="1.2rem" className="mb-1 mr-2 inline-block" />
          Bitbucket Integration
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
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} label="Secrets Path">
              <Input
                value={value}
                onChange={onChange}
                placeholder='Provide a path (defaults to "/")'
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="targetWorkspace"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error)}
              label="Bitbucket Workspace"
            >
              <FilterableSelect
                getOptionValue={(option) => option.slug}
                value={value}
                getOptionLabel={(option) => option.name}
                onChange={(option) => {
                  onChange(option);
                  setValue("targetRepo", null);
                  setValue("targetEnvironment", null);
                }}
                options={bitbucketWorkspaces}
                placeholder={
                  bitbucketWorkspaces?.length ? "Select a workspace..." : "No workspaces found..."
                }
                isLoading={isBitbucketWorkspacesLoading}
                isDisabled={!bitbucketWorkspaces?.length || isBitbucketWorkspacesLoading}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="targetRepo"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl errorText={error?.message} isError={Boolean(error)} label="Bitbucket Repo">
              <FilterableSelect
                getOptionValue={(option) => option.appId!}
                value={value}
                getOptionLabel={(option) => option.name}
                onChange={(option) => {
                  onChange(option);
                  setValue("targetEnvironment", null);
                }}
                options={bitbucketRepos}
                placeholder={
                  bitbucketRepos?.length ? "Select a repository..." : "No repositories found..."
                }
                isLoading={isBitbucketReposLoading}
                isDisabled={!bitbucketRepos?.length || isBitbucketReposLoading}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="scope"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl errorText={error?.message} isError={Boolean(error)} label="Scope">
              <FilterableSelect
                value={value}
                getOptionValue={(option) => option.value}
                getOptionLabel={(option) => option.label}
                onChange={onChange}
                options={ScopeOptions}
              />
            </FormControl>
          )}
        />

        {scope?.value === BitbucketScope.Env && (
          <Controller
            control={control}
            name="targetEnvironment"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                label="Bitbucket Deployment Environment"
              >
                <FilterableSelect
                  getOptionValue={(option) => option.uuid}
                  value={value}
                  getOptionLabel={(option) => option.name}
                  onChange={onChange}
                  options={bitbucketEnvironments}
                  placeholder={
                    bitbucketEnvironments?.length
                      ? "Select an environment..."
                      : "No environments found..."
                  }
                  isLoading={isBitbucketEnvironmentsLoading && Boolean(bitbucketRepo)}
                  isDisabled={!bitbucketEnvironments?.length || isBitbucketEnvironmentsLoading}
                />
              </FormControl>
            )}
          />
        )}
        <Button
          type="submit"
          colorSchema="primary"
          className="mt-4"
          isLoading={createIntegration.isPending}
          isDisabled={createIntegration.isPending || !bitbucketRepos?.length}
        >
          Create Integration
        </Button>
      </Card>
    </form>
  );
};
