import { useEffect, useMemo, useState } from "react";
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
  FilterableSelect,
  Input,
  TextArea
} from "@app/components/v3";
import {
  SignerMemberRole,
  TEffectiveSignerMember,
  useGetSignerPolicy,
  useListEffectiveSignerMembers,
  usePreApproveSigning
} from "@app/hooks/api/signers";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  signerId: string;
};

type MemberOption = { value: string; label: string; kind: "user" | "identity" };

const schema = z
  .object({
    granteeKey: z.string().min(1, "Pick a member"),
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

export const PreApproveSigningModal = ({ isOpen, onOpenChange, signerId }: Props) => {
  const users = useListEffectiveSignerMembers({ signerId, kind: "user" });
  const identities = useListEffectiveSignerMembers({ signerId, kind: "identity" });
  const { data: policy } = useGetSignerPolicy(signerId);
  const preApprove = usePreApproveSigning();
  const [submitting, setSubmitting] = useState(false);

  const maxSignings = policy?.constraints?.maxSignings ?? null;
  const maxWindowDuration = policy?.constraints?.maxWindowDuration ?? null;

  const memberOptions: MemberOption[] = useMemo(() => {
    const opts: MemberOption[] = [];
    (users.data?.members ?? []).forEach((m: TEffectiveSignerMember) => {
      if (!m.actorUserId) return;
      if (m.role === SignerMemberRole.Auditor) return;
      opts.push({
        value: `user:${m.actorUserId}`,
        label: m.details?.name || m.details?.username || m.details?.email || m.actorUserId,
        kind: "user"
      });
    });
    (identities.data?.members ?? []).forEach((m: TEffectiveSignerMember) => {
      if (!m.actorIdentityId) return;
      if (m.role === SignerMemberRole.Auditor) return;
      opts.push({
        value: `identity:${m.actorIdentityId}`,
        label: m.details?.name || m.actorIdentityId,
        kind: "identity"
      });
    });
    return opts;
  }, [users.data, identities.data]);

  const buildDefaults = (): FormData => {
    const now = Date.now();
    const allowedMs = parseWindowMs(maxWindowDuration);
    return {
      granteeKey: "",
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
      const [kind, id] = data.granteeKey.split(":");
      await preApprove.mutateAsync({
        signerId,
        granteeUserId: kind === "user" ? id : undefined,
        granteeIdentityId: kind === "identity" ? id : undefined,
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
        text: err instanceof Error ? err.message : "Failed to pre-approve"
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pre-approve signing</DialogTitle>
          <DialogDescription>
            Grant an Operator or machine identity a signed-off window without an approval flow.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <FieldGroup>
            <Controller
              name="granteeKey"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Member</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      options={memberOptions}
                      value={memberOptions.find((o) => o.value === field.value) ?? null}
                      onChange={(selected) =>
                        field.onChange((selected as MemberOption | null)?.value ?? "")
                      }
                      placeholder="Pick a member..."
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

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
                        : "Leave empty to rely on the time window."}
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
                      <FieldDescription>When access begins.</FieldDescription>
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
                      <FieldDescription>When access expires.</FieldDescription>
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
                      placeholder="Why is this being pre-approved?"
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
              Pre-approve
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
