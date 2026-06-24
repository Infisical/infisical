import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
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
import { useGetSignerPolicy, useRequestToSign } from "@app/hooks/api/signers";

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

const HOURS_24_MS = 24 * 60 * 60 * 1000;

const isoLocal = (epochMs: number) => {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const parseWindowMs = (s?: string | null): number | null => {
  if (!s) return null;
  try {
    const n = ms(s);
    return typeof n === "number" && n > 0 ? n : null;
  } catch {
    return null;
  }
};

export const RequestToSignModal = ({ isOpen, onOpenChange, signerId }: Props) => {
  const requestToSign = useRequestToSign();
  const { data: policy } = useGetSignerPolicy(signerId);
  const [submitting, setSubmitting] = useState(false);

  const maxSignings = policy?.constraints?.maxSignings ?? null;
  const maxWindowDuration = policy?.constraints?.maxWindowDuration ?? null;

  const buildDefaults = (): FormData => {
    const now = Date.now();
    const allowedMs = parseWindowMs(maxWindowDuration);
    return {
      requestedSignings: maxSignings ?? null,
      requestedWindowStart: isoLocal(now),
      requestedWindowEnd: isoLocal(now + (allowedMs ?? HOURS_24_MS)),
      justification: ""
    };
  };

  const { control, handleSubmit, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults()
  });

  useEffect(() => {
    if (!isOpen) reset(buildDefaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxSignings, maxWindowDuration]);

  const handleClose = (open: boolean) => {
    if (!open) reset(buildDefaults());
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
                      max={maxSignings ?? undefined}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        field.onChange(raw === "" ? null : Number(raw));
                      }}
                      placeholder={
                        maxSignings
                          ? `Up to ${maxSignings}`
                          : "Leave empty to rely on the time window"
                      }
                      isError={Boolean(error)}
                    />
                    <FieldDescription>
                      {maxSignings
                        ? `Policy caps each approval at ${maxSignings} signature${maxSignings === 1 ? "" : "s"}.`
                        : "Leave empty to rely on the time window instead."}
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
