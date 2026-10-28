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
import { useUpdateAgentVaultSessionLabel } from "@app/hooks/api/agentVault";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";

import { sessionLabelSchema } from "./sessionLabelSchema";

const schema = z.object({ label: sessionLabelSchema });

type FormData = z.infer<typeof schema>;

type Props = {
  session: TAgentVaultSession | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const EditSessionLabelDialog = ({ session, onOpenChange }: Props) => {
  const updateLabel = useUpdateAgentVaultSessionLabel();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (session) reset({ label: session.label ?? "" });
  }, [session, reset]);

  const onSubmit = async ({ label }: FormData) => {
    if (!session) return;

    try {
      await updateLabel.mutateAsync({ sessionId: session.id, label: label || null });
      createNotification({
        text: label ? "Session label saved" : "Session label removed",
        type: "success"
      });
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog open={Boolean(session)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{session?.label ? "Edit Label" : "Add Label"}</DialogTitle>
          <DialogDescription>A label describes what this session is for.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="label"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="agent-vault-session-label-edit">Label</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="agent-vault-session-label-edit"
                    placeholder="Nightly deploy"
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldDescription>Leave it empty to remove the label.</FieldDescription>
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
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
