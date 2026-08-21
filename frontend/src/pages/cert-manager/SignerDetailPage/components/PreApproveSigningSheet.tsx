import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeCheckIcon } from "lucide-react";
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
  FilterableSelect,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea
} from "@app/components/v3";
import {
  SignerMemberRole,
  TEffectiveSignerMember,
  useGetSignerPolicy,
  useListEffectiveSignerMembers,
  usePreApproveSigning
} from "@app/hooks/api/signers";
import {
  pickDeclaredScope,
  ScopeFieldsFormSection,
  SigningScopeSchema
} from "@app/pages/cert-manager/components/ScopeFieldsFormSection";
import { PkiDocsUrls } from "@app/pages/cert-manager/pki-docs-urls";

import {
  getDefaultSigningWindow,
  resolveSigningWindow,
  SigningWindowField
} from "../../components/SigningWindowField";

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
    requestedWindowDuration: z.string().optional(),
    justification: z.string().trim().min(1, "Reason is required").max(2048),
    scope: SigningScopeSchema
  })
  .refine((d) => d.requestedSignings || resolveSigningWindow(d.requestedWindowDuration), {
    message: "Provide a signature count or an approval duration",
    path: ["requestedSignings"]
  });

type FormData = z.infer<typeof schema>;

export const PreApproveSigningSheet = ({ isOpen, onOpenChange, signerId }: Props) => {
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

  const buildDefaults = (): FormData => ({
    granteeKey: "",
    requestedSignings: maxSignings ?? null,
    requestedWindowDuration: getDefaultSigningWindow(maxWindowDuration),
    justification: "",
    scope: []
  });

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
        requestedWindowDuration: resolveSigningWindow(data.requestedWindowDuration),
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
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-warning/10 text-warning">
                <BadgeCheckIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-x-2 text-mineshaft-300">
                  Pre-approve signing
                </div>
                <p className="text-sm leading-4 text-mineshaft-400">
                  Grant an Operator or machine identity a signed-off window without an approval
                  flow.
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

                <SigningWindowField
                  control={control}
                  name="requestedWindowDuration"
                  maxWindowDuration={maxWindowDuration}
                />

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
            </div>

            <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
              <div className="mb-auto">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                    Pre-approving
                  </p>
                  <DocumentationLinkBadge href={PkiDocsUrls.codeSigning.approvals.preApprove} />
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground">What this does</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Pre-approving skips the review step: the moment you save, the member you pick can
                  sign. It produces the same access record an approved request would, so it appears
                  on the Approvals tab with its own signature counter and expiry, and you can revoke
                  it there at any time.
                </p>
              </div>
            </aside>
          </div>

          <SheetFooter className="flex-row items-center justify-end border-t">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="project" isPending={submitting}>
              Pre-approve
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
