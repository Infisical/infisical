import { ClipboardEvent, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, PasswordGenerator } from "@app/components/v2";
import { CreatableSelect } from "@app/components/v2/CreatableSelect";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { getKeyValue } from "@app/helpers/parseEnvVar";
import { useCreateSecretV3, useCreateWsTag, useGetWsTags } from "@app/hooks/api";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { SecretType } from "@app/hooks/api/types";

import {
  PendingSecretCreate,
  PopUpNames,
  useBatchModeActions,
  usePopUpAction
} from "../../SecretMainPage.store";

const typeSchema = z.object({
  key: z.string().trim().min(1, { message: "Secret key is required" }),
  value: z.string().optional(),
  tags: z.array(z.object({ label: z.string().trim(), value: z.string().trim() })).optional()
});

type TFormSchema = z.infer<typeof typeSchema>;

type Props = {
  environment: string;
  workspaceId: string;
  secretPath?: string;
  // modal props
  autoCapitalize?: boolean;
  isProtectedBranch?: boolean;
  isBatchMode?: boolean;
};

export const CreateSecretForm = ({
  environment,
  workspaceId,
  secretPath = "/",
  autoCapitalize = true,
  isProtectedBranch = false,
  isBatchMode = false
}: Props) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<TFormSchema>({ resolver: zodResolver(typeSchema) });
  const { closePopUp } = usePopUpAction();

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();
  const createWsTag = useCreateWsTag();
  const { addPendingChange } = useBatchModeActions();

  const { permission } = useProjectPermission();
  const canReadTags = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  const { data: projectTags, isPending: isTagsLoading } = useGetWsTags(
    canReadTags ? workspaceId : ""
  );

  const secretKeyInputRef = useRef<HTMLInputElement>(null);
  const { ref: setSecretKeyHookRef, ...secretKeyRegisterRest } = register("key");

  const secretKey = watch("key");

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

  const handleFormSubmit = async ({ key, value, tags }: TFormSchema) => {
    try {
      if (isBatchMode) {
        const pendingSecretCreate: PendingSecretCreate = {
          id: key,
          type: PendingAction.Create,
          secretKey: key,
          secretValue: value || "",
          secretComment: "",
          tags: tags?.map((el) => ({ id: el.value, slug: el.label })),
          timestamp: Date.now(),
          resourceType: "secret"
        };
        addPendingChange(pendingSecretCreate, {
          workspaceId,
          environment,
          secretPath
        });
        closePopUp(PopUpNames.CreateSecretForm);
        reset();
        return;
      }
      await createSecretV3({
        environment,
        workspaceId,
        secretPath,
        secretKey: key,
        secretValue: value || "",
        secretComment: "",
        type: SecretType.Shared,
        tagIds: tags?.map((el) => el.value)
      });
      closePopUp(PopUpNames.CreateSecretForm);
      reset();

      createNotification({
        type: isProtectedBranch ? "info" : "success",
        text: isProtectedBranch
          ? "Requested changes have been sent for review"
          : "Successfully created secret"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to create secret"
      });
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
      const keyStr = autoCapitalize ? key.toUpperCase() : key;
      setValue("key", keyStr);
      if (value) {
        setValue("value", value);
      }
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
          autoCapitalization={autoCapitalize}
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
            <div className="flex items-center gap-2">
              <InfisicalSecretInput
                {...field}
                environment={environment}
                secretPath={secretPath}
                containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
              />
              <PasswordGenerator onUsePassword={field.onChange} />
            </div>
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
          onClick={() => closePopUp(PopUpNames.CreateSecretForm)}
          variant="plain"
          colorSchema="secondary"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};
