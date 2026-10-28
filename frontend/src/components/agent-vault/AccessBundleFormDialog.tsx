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
  Input
} from "@app/components/v3";
import { agentVaultDescriptionSchema } from "@app/helpers/agentVaultDescription";
import {
  useCreateAgentVaultAccessBundle,
  useUpdateAgentVaultAccessBundle
} from "@app/hooks/api/agentVault";
import { TAgentVaultAccessBundle } from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

const schema = z.object({
  name: slugSchema({ max: 64, field: "Name" }),
  description: agentVaultDescriptionSchema.optional()
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accessBundle?: TAgentVaultAccessBundle;
  onCreated?: (accessBundle: TAgentVaultAccessBundle) => void;
};

export const AccessBundleFormDialog = ({
  isOpen,
  onOpenChange,
  accessBundle,
  onCreated
}: Props) => {
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
    try {
      let createdAccessBundle: TAgentVaultAccessBundle | undefined;
      if (accessBundle) {
        const nextDescription = description || null;
        await updateAccessBundle.mutateAsync({
          accessBundleId: accessBundle.id,
          name,
          // Sent only when changed, so the update's audit event doesn't read as clearing it.
          description:
            nextDescription !== (accessBundle.description ?? null) ? nextDescription : undefined
        });
      } else {
        createdAccessBundle = await createAccessBundle.mutateAsync({
          name,
          description: description || undefined
        });
      }

      createNotification({
        text: `Access bundle "${name}" ${isUpdate ? "updated" : "created"}`,
        type: "success"
      });
      onOpenChange(false);
      if (createdAccessBundle) onCreated?.(createdAccessBundle);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isUpdate ? "Edit Access Bundle" : "Create Access Bundle"}</DialogTitle>
          <DialogDescription>
            An access bundle groups the services an agent can reach in one session.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>Name</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    placeholder="on-call-infrastructure"
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldDescription>Use lowercase letters, numbers, and hyphens.</FieldDescription>
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
                  <Input
                    {...field}
                    placeholder="Paging, metrics, issue tracking"
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />

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
