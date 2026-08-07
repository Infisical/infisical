import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PenToolIcon } from "lucide-react";
import { z } from "zod";

import {
  Button,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea
} from "@app/components/v3";
import { parseDurationMs, toDateTimeLocalInputValue } from "@app/helpers/datetime";
import { useGetSignerPolicy, useRequestToSign } from "@app/hooks/api/signers";
import {
  pickDeclaredScope,
  ScopeFieldsFormSection,
  SigningScopeSchema
} from "@app/pages/cert-manager/components/ScopeFieldsFormSection";
import { PkiDocsUrls } from "@app/pages/cert-manager/pki-docs-urls";

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
    justification: z.string().trim().min(1, "Reason is required").max(2048),
    scope: SigningScopeSchema
  })
  .refine((d) => d.requestedSignings || d.requestedWindowEnd, {
    message: "Provide a signature count or a window end",
    path: ["requestedSignings"]
  });

type FormData = z.infer<typeof schema>;

const DEFAULT_SIGNING_WINDOW_MS = 24 * 60 * 60 * 1000;

export const RequestToSignSheet = ({ isOpen, onOpenChange, signerId }: Props) => {
  const requestToSign = useRequestToSign();
  const { data: policy } = useGetSignerPolicy(signerId);
  const [submitting, setSubmitting] = useState(false);

  const maxSignings = policy?.constraints?.maxSignings ?? null;
  const maxWindowDuration = policy?.constraints?.maxWindowDuration ?? null;

  const buildDefaults = (): FormData => {
    const now = Date.now();
    const allowedMs = parseDurationMs(maxWindowDuration);
    return {
      requestedSignings: maxSignings ?? null,
      requestedWindowStart: toDateTimeLocalInputValue(now),
      requestedWindowEnd: toDateTimeLocalInputValue(now + (allowedMs ?? DEFAULT_SIGNING_WINDOW_MS)),
      justification: "",
      scope: []
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
          : undefined,
        scope: pickDeclaredScope(data.scope)
      });
      handleClose(false);
    } catch {
      // The mutation cache reports the failure, so showing it here would duplicate the toast.
      // Caught only so the sheet stays open for another attempt.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1100px]">
        <SheetHeader className="border-b">
          <SheetTitle>
            <div className="flex w-full items-start gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-project/10 text-project">
                <PenToolIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-x-2 text-mineshaft-300">Request to sign</div>
                <p className="text-sm leading-4 text-mineshaft-400">
                  Ask the approvers to let you sign. Pick how many signatures you need and when.
                </p>
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
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

                <ScopeFieldsFormSection control={control} />

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
            </div>

            <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
              <div className="mb-auto">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                    Requesting access
                  </p>
                  <DocumentationLinkBadge href={PkiDocsUrls.codeSigning.approvals.requestToSign} />
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground">What happens next</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Your request goes to this signer&apos;s approvers, and you cannot sign until one
                  of them approves it. On approval it becomes an access record with the signatures
                  and window you asked for. The window is measured from when you send the request,
                  not from when it is approved, so allow for review time.
                </p>
              </div>
            </aside>
          </div>

          <SheetFooter className="flex-row items-center justify-end border-t">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="project" isPending={submitting}>
              Send request
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
