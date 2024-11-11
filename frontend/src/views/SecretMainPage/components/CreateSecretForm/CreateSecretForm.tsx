import { ClipboardEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Input } from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { getKeyValue } from "@app/helpers/parseEnvVar";
import { useCreateSecretV3, useGetWsTags } from "@app/hooks/api";
import { SecretType } from "@app/hooks/api/types";

import { PopUpNames, usePopUpAction } from "../../SecretMainPage.store";

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
};

export const CreateSecretForm = ({
  environment,
  workspaceId,
  secretPath = "/",
  autoCapitalize = true,
  isProtectedBranch = false
}: Props) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<TFormSchema>({ resolver: zodResolver(typeSchema) });
  const { closePopUp } = usePopUpAction();

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();
  const { permission } = useProjectPermission();
  const canReadTags = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  const { data: projectTags, isLoading: isTagsLoading } = useGetWsTags(
    canReadTags ? workspaceId : ""
  );

  const handleFormSubmit = async ({ key, value, tags }: TFormSchema) => {
    try {
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
    e.preventDefault();
    const delimitters = [":", "="];
    const pastedContent = e.clipboardData.getData("text");
    const { key, value } = getKeyValue(pastedContent, delimitters);

    setValue("key", key);
    setValue("value", value);
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
          {...register("key")}
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
            <InfisicalSecretInput
              {...field}
              environment={environment}
              secretPath={secretPath}
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
            <FilterableSelect
              className="w-full"
              placeholder="Select tags to assign to secret..."
              isMulti
              name="tagIds"
              isDisabled={!canReadTags}
              isLoading={isTagsLoading}
              options={projectTags?.map((el) => ({ label: el.slug, value: el.id }))}
              value={field.value}
              onChange={field.onChange}
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
