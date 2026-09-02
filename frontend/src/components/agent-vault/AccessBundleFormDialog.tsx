import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
import {
  useCreateAgentVaultAccessBundle,
  useUpdateAgentVaultAccessBundle
} from "@app/hooks/api/agentVault";
import { TAgentVaultAccessBundle } from "@app/hooks/api/agentVault/types";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Required")
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
  description: z.string().trim().max(256).optional()
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // Present in edit mode; absent when creating.
  accessBundle?: TAgentVaultAccessBundle;
};

export const AccessBundleFormDialog = ({ isOpen, onOpenChange, accessBundle }: Props) => {
  const createAccessBundle = useCreateAgentVaultAccessBundle();
  const updateAccessBundle = useUpdateAgentVaultAccessBundle();
  const isUpdate = Boolean(accessBundle);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({ name: accessBundle?.name ?? "", description: accessBundle?.description ?? "" });
    }
  }, [isOpen, accessBundle, reset]);

  const onSubmit = async ({ name, description }: FormData) => {
    if (accessBundle) {
      await updateAccessBundle.mutateAsync({
        accessBundleId: accessBundle.id,
        name,
        description: description || null
      });
    } else {
      await createAccessBundle.mutateAsync({ name, description: description || undefined });
    }

    createNotification({
      text: `Access bundle "${name}" ${isUpdate ? "updated" : "created"}`,
      type: "success"
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isUpdate ? "Edit Access Bundle" : "Create Access Bundle"}</DialogTitle>
            <DialogDescription>
              An access bundle groups the connections an agent may use. You grant the bundle, not
              the individual connections.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <FieldContent>
                    <Input {...field} placeholder="on-call-infrastructure" />
                    <FieldDescription>Lowercase letters, numbers and hyphens.</FieldDescription>
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Description</FieldLabel>
                  <FieldContent>
                    <TextArea {...field} rows={2} placeholder="Paging, metrics, issue tracking" />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="av" isPending={isSubmitting}>
              {isUpdate ? "Save" : "Create Access Bundle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
