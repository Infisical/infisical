import { ClipboardEvent, JSX, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { faTriangleExclamation, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, PasswordGenerator, Tooltip } from "@app/components/v2";
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
import { VALID_KEY_REGEX } from "@app/components/utilities/parseSecrets";

const typeSchema = z.object({
  key: z.string().trim().min(1, { message: "Secret key is required" }),
  value: z.string().optional(),
  tags: z.array(z.object({ label: z.string().trim(), value: z.string().trim() })).optional()
});

type TFormSchema = z.infer<typeof typeSchema>;

type Props = {
  environment: string;
  projectId: string;
  secretPath?: string;
  // modal props
  autoCapitalize?: boolean;
  isProtectedBranch?: boolean;
  isBatchMode?: boolean;
};

export const CreateSecretForm = ({
  environment,
  projectId,
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
    canReadTags ? projectId : ""
  );

  const secretKeyInputRef = useRef<HTMLInputElement>(null);
  const { ref: setSecretKeyHookRef, ...secretKeyRegisterRest } = register("key");

  const secretKey = watch("key");

  const slugSchema = z.string().trim().toLowerCase().min(1);
  const createNewTag = async (slug: string) => {
    // TODO: Replace with slugSchema generic
    const parsedSlug = slugSchema.parse(slug);
    await createWsTag.mutateAsync({
      projectId,
      tagSlug: parsedSlug,
      tagColor: ""
    });
  };

  const handleFormSubmit = async ({ key, value, tags }: TFormSchema) => {
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
        projectId,

        environment,
        secretPath
      });
      closePopUp(PopUpNames.CreateSecretForm);
      reset();
      return;
    }
    await createSecretV3({
      environment,
      projectId,
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

  const getWarningTooltip = (secretKey: string): JSX.Element | undefined => {
    if (secretKey?.includes(" ")) {
      return (
        <Tooltip
          className="w-full max-w-72"
          content={
            <div>
              Secret key contains whitespaces.
              <br />
              <br /> If this is the desired format, you need to provide it as{" "}
              <code className="rounded-md bg-mineshaft-500 px-1 py-0.5">
                {encodeURIComponent(secretKey.trim())}
              </code>{" "}
              when making API requests.
            </div>
          }
        >
          <FontAwesomeIcon
            icon={faWarning}
            className="absolute right-0 mr-3 text-yellow-600"
          />
        </Tooltip>
      )
    }

    if (secretKey && !VALID_KEY_REGEX.test(secretKey)) {
      return (
        <Tooltip
          className="w-full max-w-72"
          content={
            <div>
              Secret key contains invalid characters.
              <br />
              <br />
              Allowed characters:
              <code className="rounded-md bg-mineshaft-500 px-1 py-0.5 ml-1">
                A–Z a–z 0–9 . _ -
              </code>
              <br />
            </div>
          }>
          <FontAwesomeIcon
            icon={faWarning}
            className="absolute right-0 mr-3 text-yellow-600"
          />
        </Tooltip>
      )
    }

    return undefined;
  }

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
          warning={getWarningTooltip(secretKey)}
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
            tooltipText={
              <div>
                You can add references to other secrets using the format{" "}
                <code className="rounded-sm bg-mineshaft-600 px-1 py-0.5">
                  &#36;{"{"}secret_name{"}"}
                </code>
                <br />
                <br />
                You can go to the referenced secret by holding the{" "}
                <code className="rounded-sm bg-mineshaft-600 px-1 py-0.5">Cmd</code> (Mac) or{" "}
                <code className="rounded-sm bg-mineshaft-600 px-1 py-0.5">Ctrl</code>{" "}
                (Windows/Linux) key and clicking on the secret name.
              </div>
            }
            tooltipClassName="max-w-md"
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
