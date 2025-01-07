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
  useGetIntegrationAuthBitBucketWorkspaces
} from "@app/hooks/api";
import { useGetIntegrationAuthBitBucketEnvironments } from "@app/hooks/api/integrationAuth/queries";

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
    targetRepo: z.object({ name: z.string(), appId: z.string() }),
    targetWorkspace: z.object({ name: z.string(), slug: z.string() }),
    targetEnvironment: z.object({ name: z.string(), uuid: z.string() }).optional(),
    scope: z.object({ label: z.string(), value: z.nativeEnum(BitbucketScope) })
  })
  .superRefine((val, ctx) => {
    if (val.scope.value === BitbucketScope.Env && !val.targetEnvironment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetEnvironment"],
        message: "Required"
      });
    }
  });

type TFormData = z.infer<typeof formSchema>;

export const BitbucketConfigurePage = () => {
  const navigate = useNavigate();
  const createIntegration = useCreateIntegration();

  const { watch, control, reset, handleSubmit } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      secretPath: "/"
    }
  });

  const bitBucketWorkspace = watch("targetWorkspace");
  const bitBucketRepo = watch("targetRepo");

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.BitbucketConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { currentWorkspace } = useWorkspace();

  const { data: bitbucketWorkspaces, isPending: isBitbucketWorkspacesLoading } =
    useGetIntegrationAuthBitBucketWorkspaces((integrationAuthId as string) ?? "");

  const { data: bitbucketRepos, isPending: isBitbucketReposLoading } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? "",
    workspaceSlug: bitBucketWorkspace?.slug
  });

  const { data: bitbucketEnvironments } = useGetIntegrationAuthBitBucketEnvironments(
    {
      integrationAuthId: (integrationAuthId as string) ?? "",
      workspaceSlug: bitBucketWorkspace?.slug,
      repoSlug: bitBucketRepo?.appId
    },
    { enabled: Boolean(bitBucketWorkspace?.slug && bitBucketRepo?.appId) }
  );

  const onSubmit = async ({
    targetRepo,
    sourceEnvironment,
    targetWorkspace,
    secretPath,
    targetEnvironment,
    scope
  }: TFormData) => {
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
        to: "/secret-manager/$projectId/integrations",
        params: {
          projectId: currentWorkspace.id
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
    if (!bitbucketRepos || !bitbucketWorkspaces || !currentWorkspace) return;

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
                onChange={onChange}
                options={bitbucketWorkspaces}
                placeholder={
                  bitbucketWorkspaces?.length ? "Select a workspace..." : "No workspaces found..."
                }
                isDisabled={!bitbucketWorkspaces?.length}
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
                onChange={onChange}
                options={bitbucketRepos}
                placeholder={
                  bitbucketRepos?.length ? "Select a repository..." : "No repositories found..."
                }
                isDisabled={!bitbucketRepos?.length}
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
                  isDisabled={!bitbucketEnvironments?.length}
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
