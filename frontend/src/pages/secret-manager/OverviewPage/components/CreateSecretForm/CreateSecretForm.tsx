import { ClipboardEvent, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Input } from "@app/components/v2";
import { CreatableSelect } from "@app/components/v2/CreatableSelect";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { getKeyValue } from "@app/helpers/parseEnvVar";
import { useCreateFolder, useCreateSecretV3, useCreateWsTag, useGetWsTags } from "@app/hooks/api";
import { SecretType } from "@app/hooks/api/types";

const typeSchema = z
  .object({
    key: z.string().trim().min(1, "Key is required"),
    value: z.string().optional(),
    environments: z.object({ name: z.string(), slug: z.string() }).array(),
    tags: z.array(z.object({ label: z.string().trim(), value: z.string().trim() })).optional()
  })
  .refine((data) => data.key !== undefined, {
    message: "Please enter secret name"
  });

type TFormSchema = z.infer<typeof typeSchema>;

type Props = {
  secretPath?: string;
  // modal props
  onClose: () => void;
};

export const CreateSecretForm = ({ secretPath = "/", onClose }: Props) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<TFormSchema>({ resolver: zodResolver(typeSchema) });

  const { currentWorkspace } = useWorkspace();
  const { permission } = useProjectPermission();
  const canReadTags = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  const workspaceId = currentWorkspace?.id || "";
  const environments = currentWorkspace?.environments || [];

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();
  const { mutateAsync: createFolder } = useCreateFolder();
  const { data: projectTags, isPending: isTagsLoading } = useGetWsTags(
    canReadTags ? workspaceId : ""
  );

  const secretKeyInputRef = useRef<HTMLInputElement>(null);
  const { ref: setSecretKeyHookRef, ...secretKeyRegisterRest } = register("key");

  const secretKey = watch("key");

  const handleFormSubmit = async ({ key, value, environments: selectedEnv, tags }: TFormSchema) => {
    const promises = selectedEnv.map(async (env) => {
      const environment = env.slug;
      // create folder if not existing
      if (secretPath !== "/") {
        // /hello/world -> [hello","world"]
        const pathSegment = secretPath.split("/").filter(Boolean);
        const parentPath = `/${pathSegment.slice(0, -1).join("/")}`;
        const folderName = pathSegment.at(-1);
        const canCreateFolder = permission.can(
          ProjectPermissionActions.Create,
          subject(ProjectPermissionSub.SecretFolders, {
            environment: env.slug,
            secretPath: parentPath
          })
        );

        if (folderName && parentPath && canCreateFolder) {
          await createFolder({
            projectId: workspaceId,
            path: parentPath,
            environment,
            name: folderName
          });
        }
      }

      // TODO: add back ability to overwrite - need to fetch secrets by key to check for conflicts as previous method broke with pagination

      return {
        ...(await createSecretV3({
          environment,
          workspaceId,
          secretPath,
          secretKey: key,
          secretValue: value || "",
          secretComment: "",
          type: SecretType.Shared,
          tagIds: tags?.map((el) => el.value)
        })),
        environment
      };
    });

    const results = await Promise.allSettled(promises);
    const forApprovalEnvs = results
      .map((result) =>
        result.status === "fulfilled" && "approval" in result.value
          ? result.value.environment
          : undefined
      )
      .filter(Boolean) as string[];

    const updatedEnvs = results
      .map((result) =>
        result.status === "fulfilled" && !("approval" in result.value)
          ? result.value.environment
          : undefined
      )
      .filter(Boolean) as string[];

    if (forApprovalEnvs.length) {
      createNotification({
        type: "info",
        text: `Change request submitted for ${
          forApprovalEnvs.length > 1 ? "environments" : "environment"
        }: ${forApprovalEnvs.join(", ")}`
      });
    }

    if (updatedEnvs.length) {
      createNotification({
        type: "success",
        text: `Secrets created in ${
          updatedEnvs.length > 1 ? "environments" : "environment"
        }: ${updatedEnvs.join(", ")}`
      });
    }

    if (!updatedEnvs.length && !forApprovalEnvs.length) {
      createNotification({
        type: "error",
        text: "Failed to create secrets"
      });
    } else {
      onClose();
      reset();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const delimitters = [":", "="];
    const pastedContent = e.clipboardData.getData("text");
    const { key, value } = getKeyValue(pastedContent, delimitters);

    const isWholeKeyHighlighted =
      secretKeyInputRef.current &&
      secretKeyInputRef.current.selectionStart === 0 &&
      secretKeyInputRef.current.selectionEnd === secretKeyInputRef.current.value.length;

    if (!secretKey || isWholeKeyHighlighted) {
      e.preventDefault();
      const keyStr = currentWorkspace.autoCapitalization ? key.toUpperCase() : key;
      setValue("key", keyStr);
      if (value) {
        setValue("value", value);
      }
    }
  };

  const createWsTag = useCreateWsTag();
  const slugSchema = z.string().trim().toLowerCase().min(1);
  const createNewTag = async (slug: string) => {
    // TODO: Replace with slugSchema generic
    try {
      const parsedSlug = slugSchema.parse(slug);
      await createWsTag.mutateAsync({
        workspaceID: workspaceId,
        tagSlug: parsedSlug,
        tagColor: ""
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to create new tag"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} noValidate>
      <FormControl
        label="Key"
        isRequired
        isError={Boolean(errors?.key)}
        errorText={errors?.key?.message}
      >
        <Input
          {...secretKeyRegisterRest}
          ref={(e) => {
            setSecretKeyHookRef(e);
            // @ts-expect-error this is for multiple ref single component
            secretKeyInputRef.current = e;
          }}
          placeholder="Type your secret name"
          onPaste={handlePaste}
          autoCapitalization={currentWorkspace?.autoCapitalization}
        />
      </FormControl>
      <Controller
        control={control}
        name="value"
        render={({ field }) => (
          <FormControl
            label="Value"
            isError={Boolean(errors?.value)}
            errorText={errors?.value?.message}
          >
            <InfisicalSecretInput
              {...field}
              containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="tags"
        render={({ field }) => (
          <FormControl
            label="Tags"
            isError={Boolean(errors?.value)}
            errorText={errors?.value?.message}
            helperText={
              !canReadTags ? (
                <div className="flex items-center space-x-2">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="text-yellow-400" />
                  <span>You do not have permission to read tags.</span>
                </div>
              ) : (
                ""
              )
            }
          >
            <CreatableSelect
              isMulti
              className="w-full"
              placeholder="Select tags to assign to secret..."
              isValidNewOption={(v) => slugSchema.safeParse(v).success}
              name="tagIds"
              isDisabled={!canReadTags}
              isLoading={isTagsLoading && canReadTags}
              options={projectTags?.map((el) => ({ label: el.slug, value: el.id }))}
              value={field.value}
              onChange={field.onChange}
              onCreateOption={createNewTag}
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl label="Environments" isError={Boolean(error)} errorText={error?.message}>
            <FilterableSelect
              isMulti
              options={environments.filter((environment) =>
                permission.can(
                  ProjectPermissionSecretActions.Create,
                  subject(ProjectPermissionSub.Secrets, {
                    environment: environment.slug,
                    secretPath,
                    secretName: "*",
                    secretTags: ["*"]
                  })
                )
              )}
              value={value}
              onChange={onChange}
              placeholder="Select environments to create secret in..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.slug}
            />
          </FormControl>
        )}
        name="environments"
      />
      <div className="mt-7 flex items-center">
        <Button
          isDisabled={isSubmitting}
          isLoading={isSubmitting}
          key="layout-create-project-submit"
          className="mr-4"
          type="submit"
        >
          Create Secret
        </Button>
        <Button
          key="layout-cancel-create-project"
          onClick={onClose}
          variant="plain"
          colorSchema="secondary"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};
