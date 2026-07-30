import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Label,
  Switch
} from "@app/components/v3";
import { useProject } from "@app/context";
import { TProjectIdentity, useUpdateProjectIdentity } from "@app/hooks/api";

const schema = z.object({
  name: z.string().min(1, "Required"),
  hasDeleteProtection: z.boolean(),
  metadata: z
    .object({
      key: z.string().trim().min(1),
      value: z.string().trim().min(1)
    })
    .array()
    .default([])
    .optional()
});
export type FormData = z.infer<typeof schema>;

type ContentProps = {
  onClose: () => void;
  identity: TProjectIdentity;
};

export const ProjectIdentityModal = ({ onClose, identity }: ContentProps) => {
  const { currentProject } = useProject();

  const { mutateAsync: updateMutateAsync } = useUpdateProjectIdentity();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: identity?.name ?? "",
      hasDeleteProtection: identity?.hasDeleteProtection ?? true,
      metadata: identity?.metadata ?? []
    }
  });

  const metadataFormFields = useFieldArray({
    control,
    name: "metadata"
  });

  const onFormSubmit = async ({ name, metadata, hasDeleteProtection }: FormData) => {
    try {
      await updateMutateAsync({
        identityId: identity.id,
        name,
        hasDeleteProtection,
        projectId: currentProject.id,
        metadata
      });

      onClose();

      createNotification({
        text: "Successfully updated machine identity",
        type: "success"
      });

      reset();
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to update machine identity";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
      <Controller
        control={control}
        defaultValue=""
        name="name"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <Input {...field} autoFocus placeholder="Machine 1" isError={Boolean(error)} />
            </FieldContent>
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="hasDeleteProtection"
        render={({ field: { onChange, value } }) => (
          <Field orientation="horizontal">
            <Switch
              id="delete-protection-enabled"
              variant="project"
              checked={value}
              onCheckedChange={onChange}
            />
            <FieldContent>
              <Label htmlFor="delete-protection-enabled">Delete Protection</Label>
              <FieldDescription>
                Prevents this identity from being deleted while enabled.
              </FieldDescription>
            </FieldContent>
          </Field>
        )}
      />
      <div className="flex flex-col gap-2">
        <Label>Metadata</Label>
        <div
          className={`flex max-h-[30vh] thin-scrollbar flex-col gap-3 overflow-y-auto rounded-md border border-border bg-container/50 p-4 ${
            metadataFormFields.fields.length === 0 ? "border-dashed" : ""
          }`}
        >
          {metadataFormFields.fields.length === 0 ? (
            <p className="text-center text-sm text-muted">
              No metadata entries. Click below to add.
            </p>
          ) : (
            metadataFormFields.fields.map(({ id: metadataFieldId }, i) => (
              <div key={metadataFieldId} className="flex items-start gap-2">
                <Field className="flex-1">
                  {i === 0 && <FieldLabel className="text-xs">Key</FieldLabel>}
                  <FieldContent>
                    <Controller
                      control={control}
                      name={`metadata.${i}.key`}
                      render={({ field, fieldState: { error } }) => (
                        <>
                          <Input {...field} isError={Boolean(error)} />
                          {error && <FieldError>{error.message}</FieldError>}
                        </>
                      )}
                    />
                  </FieldContent>
                </Field>
                <Field className="flex-1">
                  {i === 0 && <FieldLabel className="text-xs">Value</FieldLabel>}
                  <FieldContent>
                    <Controller
                      control={control}
                      name={`metadata.${i}.value`}
                      render={({ field, fieldState: { error } }) => (
                        <>
                          <Input {...field} isError={Boolean(error)} />
                          {error && <FieldError>{error.message}</FieldError>}
                        </>
                      )}
                    />
                  </FieldContent>
                </Field>
                <IconButton
                  aria-label="Remove metadata entry"
                  variant="ghost"
                  size="sm"
                  type="button"
                  className={twMerge(i === 0 ? "mt-[27px]" : "mt-[3px]", "hover:text-danger")}
                  onClick={() => metadataFormFields.remove(i)}
                >
                  <TrashIcon />
                </IconButton>
              </div>
            ))
          )}
        </div>
        <div>
          <Button
            variant="ghost"
            size="xs"
            type="button"
            onClick={() => metadataFormFields.append({ key: "", value: "" })}
          >
            <PlusIcon className="mr-1 size-4" />
            Add Entry
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="project" isPending={isSubmitting} isDisabled={isSubmitting}>
          Update
        </Button>
      </div>
    </form>
  );
};
