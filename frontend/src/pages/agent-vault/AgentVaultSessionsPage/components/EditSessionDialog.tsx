import { useEffect } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
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
import { useProject } from "@app/context";
import { useUpdateAgentVaultSession } from "@app/hooks/api/agentVault";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";

import { sessionLabelSchema } from "./sessionLabelSchema";
import { SessionMetadataFields } from "./SessionMetadataFields";
import {
  metadataRecordToRows,
  metadataRowsToRecord,
  sessionMetadataRowsSchema
} from "./sessionMetadataSchema";

const schema = z.object({ label: sessionLabelSchema, metadata: sessionMetadataRowsSchema });

type FormData = z.infer<typeof schema>;

type Props = {
  session: TAgentVaultSession | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const EditSessionDialog = ({ session, onOpenChange }: Props) => {
  const { projectId } = useProject();
  const updateSession = useUpdateAgentVaultSession(projectId);

  const formMethods = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { label: "", metadata: [] }
  });
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = formMethods;

  useEffect(() => {
    if (session) {
      reset({ label: session.label ?? "", metadata: metadataRecordToRows(session.metadata) });
    }
  }, [session, reset]);

  const onSubmit = async ({ label, metadata }: FormData) => {
    if (!session) return;

    try {
      await updateSession.mutateAsync({
        sessionId: session.id,
        label: label || null,
        metadata: metadataRowsToRecord(metadata)
      });
      createNotification({ text: "Session updated", type: "success" });
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog open={Boolean(session)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Session</DialogTitle>
          <DialogDescription>
            A label and metadata describe what this session is for.
          </DialogDescription>
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

          <FormProvider {...formMethods}>
            <SessionMetadataFields idPrefix="agent-vault-session-edit" />
          </FormProvider>

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
