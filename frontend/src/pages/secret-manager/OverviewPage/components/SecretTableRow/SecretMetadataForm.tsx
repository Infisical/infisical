import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Switch,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useUpdateSecretV3 } from "@app/hooks/api";
import { SecretType } from "@app/hooks/api/types";

const formSchema = (enforceEncryption?: boolean) =>
  z.object({
    metadata: z.array(
      z.object({
        key: z.string().min(1, "Key is required"),
        value: z.string(),
        isEncrypted: enforceEncryption ? z.literal(true) : z.boolean().default(false)
      })
    )
  });

type TFormSchema = z.infer<ReturnType<typeof formSchema>>;

type Props = {
  secretMetadata?: { key: string; value: string; isEncrypted?: boolean }[];
  secretKey: string;
  environment: string;
  secretPath: string;
  isOverride?: boolean;
  onClose?: () => void;
};

export const SecretMetadataForm = ({
  secretMetadata,
  secretKey,
  environment,
  secretPath,
  isOverride,
  onClose
}: Props) => {
  const { projectId, currentProject } = useProject();
  const { mutateAsync: updateSecretV3, isPending } = useUpdateSecretV3();
  const { permission } = useProjectPermission();

  const canEditSecret = permission.can(
    ProjectPermissionSecretActions.Edit,
    subject(ProjectPermissionSub.Secrets, {
      environment,
      secretPath,
      secretName: secretKey,
      secretTags: ["*"]
    })
  );

  const {
    handleSubmit,
    control,
    formState: { isDirty, errors }
  } = useForm<TFormSchema>({
    defaultValues: {
      metadata:
        secretMetadata?.map((m) => ({
          key: m.key,
          value: m.value,
          isEncrypted:
            m.isEncrypted ?? currentProject?.enforceEncryptedSecretManagerSecretMetadata ?? false
        })) ?? []
    },
    resolver: zodResolver(formSchema(currentProject?.enforceEncryptedSecretManagerSecretMetadata))
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "metadata"
  });

  const onSubmit = async (data: TFormSchema) => {
    const result = await updateSecretV3({
      environment,
      projectId,
      secretPath,
      secretKey,
      type: isOverride ? SecretType.Personal : SecretType.Shared,
      secretMetadata: data.metadata.map((m) => ({
        key: m.key,
        value: m.value,
        isEncrypted: m.isEncrypted
      }))
    });

    if ("approval" in result) {
      createNotification({
        type: "info",
        text: "Requested change has been sent for review"
      });
    } else {
      createNotification({
        type: "success",
        text: "Successfully updated metadata"
      });
    }
    onClose?.();
  };

  const nonEncryptedMetadata = errors?.metadata?.some(
    (metadata) => metadata?.isEncrypted?.type === "invalid_literal"
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <p className="text-sm font-medium">Metadata</p>
        <p className="mt-1 text-xs text-accent">
          Encrypted Metadata will not be searchable via the UI or API.
        </p>
      </div>
      <div className="flex max-h-64 thin-scrollbar flex-col gap-3 overflow-y-auto rounded-md border border-border bg-container/50 p-4">
        {fields.length === 0 && (
          <p className="text-center text-sm text-muted">No metadata entries. Click below to add.</p>
        )}
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-start gap-3">
            <Field className="flex-1">
              {index === 0 && <FieldLabel className="text-xs">Key</FieldLabel>}
              <FieldContent>
                <Controller
                  control={control}
                  name={`metadata.${index}.key`}
                  render={({ field: inputField, fieldState: { error } }) => (
                    <>
                      <UnstableInput
                        {...inputField}
                        placeholder="Enter key"
                        className="h-8"
                        disabled={!canEditSecret}
                      />
                      <FieldError errors={[error]} />
                    </>
                  )}
                />
              </FieldContent>
            </Field>

            <Field className="flex-1">
              {index === 0 && <FieldLabel className="text-xs">Value</FieldLabel>}
              <FieldContent>
                <Controller
                  control={control}
                  name={`metadata.${index}.value`}
                  render={({ field: inputField, fieldState: { error } }) => (
                    <>
                      <UnstableInput
                        {...inputField}
                        placeholder="Enter value"
                        className="h-8"
                        disabled={!canEditSecret}
                      />
                      <FieldError errors={[error]} />
                    </>
                  )}
                />
              </FieldContent>
            </Field>

            <Field className="w-10">
              {index === 0 && <FieldLabel className="text-xs">Encrypt</FieldLabel>}
              <Controller
                control={control}
                name={`metadata.${index}.isEncrypted`}
                render={({ field: switchField }) => (
                  <Switch
                    className="mt-2"
                    variant="project"
                    size="default"
                    checked={switchField.value}
                    onCheckedChange={switchField.onChange}
                    disabled={!canEditSecret}
                  />
                )}
              />
            </Field>

            <UnstableIconButton
              variant="ghost"
              size="xs"
              type="button"
              className={twMerge(
                index === 0 ? "mt-6.5" : "mt-0.5",
                "transition-transform hover:text-red"
              )}
              onClick={() => remove(index)}
              isDisabled={!canEditSecret}
            >
              <TrashIcon className="size-4" />
            </UnstableIconButton>
          </div>
        ))}
      </div>

      {nonEncryptedMetadata && (
        <FieldError
          className="text-sm"
          errors={[{ message: "Project requires all metadata to be encrypted" }]}
        />
      )}

      {canEditSecret && (
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={() =>
            append({
              key: "",
              value: "",
              isEncrypted: currentProject?.enforceEncryptedSecretManagerSecretMetadata ?? false
            })
          }
        >
          <PlusIcon className="mr-1 size-4" />
          Add Entry
        </Button>
      )}

      {!canEditSecret && (
        <p className="text-muted-foreground text-xs">
          You do not have permission to edit metadata on this secret.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="xs" type="button" onClick={onClose}>
          Close
        </Button>
        {canEditSecret && (
          <Button
            variant="project"
            size="xs"
            type="submit"
            isDisabled={!isDirty || isPending}
            isPending={isPending}
          >
            Save Metadata
          </Button>
        )}
      </div>
    </form>
  );
};
