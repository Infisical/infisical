import { useState } from "react";
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
  FieldGroup,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
import { useRequestToSign } from "@app/hooks/api/signers";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  signerId: string;
};

const schema = z
  .object({
    requestedSignings: z.preprocess(
      (v) => {
        if (v === "" || v === null || v === undefined) return null;
        const n = typeof v === "number" ? v : Number(v);
        return Number.isNaN(n) ? v : n;
      },
      z
        .union([z.number().int("Must be a whole number").min(1, "Must be at least 1"), z.null()])
        .optional()
    ),
    requestedWindowStart: z.string().optional(),
    requestedWindowEnd: z.string().optional(),
    justification: z.string().trim().min(1, "Reason is required").max(2048)
  })
  .refine((d) => d.requestedSignings || d.requestedWindowEnd, {
    message: "Provide a signature count or a window end",
    path: ["requestedSignings"]
  });

type FormData = z.infer<typeof schema>;

const isoNow = () => new Date().toISOString().slice(0, 16);
const isoIn24h = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

export const RequestToSignModal = ({ isOpen, onOpenChange, signerId }: Props) => {
  const requestToSign = useRequestToSign();
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      requestedSignings: 3,
      requestedWindowStart: isoNow(),
      requestedWindowEnd: isoIn24h(),
      justification: ""
    }
  });

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      await requestToSign.mutateAsync({
        signerId,
        justification: data.justification,
        requestedSignings: data.requestedSignings ?? undefined,
        requestedWindowStart: data.requestedWindowStart
          ? new Date(data.requestedWindowStart).toISOString()
          : undefined,
        requestedWindowEnd: data.requestedWindowEnd
          ? new Date(data.requestedWindowEnd).toISOString()
          : undefined
      });
      handleClose(false);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to open request"
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request to sign</DialogTitle>
          <DialogDescription>
            Ask the approvers to let you sign. Pick how many signatures you need and when.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <FieldGroup>
            <Controller
              name="requestedSignings"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>How many signatures</FieldLabel>
                  <FieldContent>
                    <Input
                      type="number"
                      min={1}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        field.onChange(raw === "" ? null : Number(raw));
                      }}
                      placeholder="Leave empty to rely on the time window"
                      isError={Boolean(error)}
                    />
                    <FieldDescription>
                      Leave empty to rely on the time window instead.
                    </FieldDescription>
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="requestedWindowStart"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Starts</FieldLabel>
                    <FieldContent>
                      <Input
                        type="datetime-local"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || undefined)}
                        isError={Boolean(error)}
                      />
                      <FieldDescription>When access starts.</FieldDescription>
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                name="requestedWindowEnd"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Ends</FieldLabel>
                    <FieldContent>
                      <Input
                        type="datetime-local"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || undefined)}
                        isError={Boolean(error)}
                      />
                      <FieldDescription>When access ends.</FieldDescription>
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </div>

            <Controller
              name="justification"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Reason</FieldLabel>
                  <FieldContent>
                    <TextArea
                      {...field}
                      placeholder="What are you signing?"
                      rows={3}
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="project" isPending={submitting}>
              Send request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
