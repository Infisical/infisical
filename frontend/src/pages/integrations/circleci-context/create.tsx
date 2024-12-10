import { useEffect } from "react";
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
  Input,
  Spinner
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthCircleCIOrganizations
} from "@app/hooks/api/integrationAuth";

const formSchema = z.object({
  secretPath: z.string().default("/"),
  sourceEnvironment: z.object({ name: z.string(), slug: z.string() }),
  targetOrg: z.object({ name: z.string(), slug: z.string() }),
  targetContext: z.object({ name: z.string(), appId: z.string() })
});

type TFormData = z.infer<typeof formSchema>;

export default function CircleCIContextCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync, isLoading: isCreatingIntegration } = useCreateIntegration();
  const { currentWorkspace, isLoading: isProjectLoading } = useWorkspace();

  const integrationAuthId = router.query.integrationAuthId as string;

  const { watch, control, reset, handleSubmit } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      secretPath: "/",
      sourceEnvironment: currentWorkspace?.environments[0]
    }
  });

  const circleCiOrg = watch("targetOrg");

  const { data: circleCIOrganizations, isLoading: isCircleCIOrganizationsLoading } =
    useGetIntegrationAuthCircleCIOrganizations(integrationAuthId);

  const { data: circleCIContexts } = useGetIntegrationAuthApps(
    {
      integrationAuthId,
      workspaceSlug: circleCiOrg?.slug
    },

    { enabled: Boolean(circleCiOrg?.slug) }
  );

  const onSubmit = async ({
    sourceEnvironment,
    secretPath,
    targetOrg,
    targetContext
  }: TFormData) => {
    try {
      await mutateAsync({
        integrationAuthId,
        isActive: true,
        sourceEnvironment: sourceEnvironment.slug,
        app: targetContext.name,
        appId: targetContext.appId,
        owner: targetOrg.slug,
        secretPath
      });

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

  useEffect(() => {
    if (!circleCIContexts || !circleCIOrganizations || !currentWorkspace) return;

    reset({
      targetOrg: circleCIOrganizations[0],
      targetContext: circleCIContexts[0]
    });
  }, [circleCIOrganizations, circleCIContexts, currentWorkspace]);

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
          subTitle="Choose which environment or folder in Infisical you want to sync to CircleCI Context Variables."
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
              href="https://infisical.com/docs/integrations/cicd/circleci-context"
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
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} label="Secrets Path">
              <Input
                value={value}
                onChange={onChange}
                placeholder={'Provide a path (defaults to "/")'}
              />
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
                onChange={onChange}
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
          name="targetContext"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error)}
              label="CircleCI Context"
            >
              <FilterableSelect
                value={value}
                getOptionValue={(option) => option.appId!}
                getOptionLabel={(option) => option.name}
                onChange={onChange}
                options={circleCIContexts}
                placeholder={
                  circleCIContexts?.length ? "Select a context..." : "No contexts found..."
                }
                isDisabled={!circleCIContexts?.length}
              />
            </FormControl>
          )}
        />

        <Button
          type="submit"
          colorSchema="primary"
          className="mt-4"
          isLoading={isCreatingIntegration}
          isDisabled={isCreatingIntegration || !circleCIContexts?.length}
        >
          Create Integration
        </Button>
      </Card>
    </form>
  );
}

CircleCIContextCreateIntegrationPage.requireAuth = true;
