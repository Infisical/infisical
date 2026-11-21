import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { z } from "zod";

import { parseDurationMs } from "@app/helpers/datetime";
import {
  CodeSigningScopeField,
  codeSigningScopeFieldDescriptions,
  codeSigningScopeFieldLabels,
  codeSigningScopeFieldMatchRules,
  MONOSPACED_SCOPE_FIELDS,
  SignerMemberRole,
  type TCodeSigningScope
} from "@app/hooks/api/signers/types";

import { readableFailure } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { CODE_SIGNING_DOCS } from "../CodeSigningPage/signer-shared";

type ScopeEntry = { key: string; field: CodeSigningScopeField; value: string };

const NO_WINDOW = "none";
const MAX_COMMAND_LENGTH = 32767;
const MAX_SCOPE_TEXT_LENGTH = 256;
const SHA256_HEX = /^[a-fA-F0-9]{64}$/;
const SCOPE_FIELDS = Object.values(CodeSigningScopeField);

const WINDOW_PRESETS = [
  { value: "15m", label: "15 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "8h", label: "8 hours" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "1 week" }
];

const PLACEHOLDERS: Record<CodeSigningScopeField, string> = {
  [CodeSigningScopeField.Command]: "signtool sign /fd sha256 /f cert.pfx installer-v2.4.0.msi",
  [CodeSigningScopeField.SigningApplication]: "signtool.exe",
  [CodeSigningScopeField.SigningApplicationHash]: "64-character SHA-256 hex",
  [CodeSigningScopeField.Hostname]: "win-build-agent-02",
  [CodeSigningScopeField.OsUsername]: "svc-release",
  [CodeSigningScopeField.IpAddress]: "203.0.113.10",
  [CodeSigningScopeField.DataHash]: "64-character SHA-256 hex"
};

const windowOptions = (maxWindowDuration?: string | null) => {
  const maxMs = parseDurationMs(maxWindowDuration);
  if (maxMs === null || !maxWindowDuration)
    return [{ value: NO_WINDOW, label: "No limit" }, ...WINDOW_PRESETS];
  const within = WINDOW_PRESETS.filter((option) => {
    const optionMs = parseDurationMs(option.value);
    return optionMs !== null && optionMs <= maxMs;
  });
  if (within.some((option) => parseDurationMs(option.value) === maxMs)) return within;
  return [...within, { value: maxWindowDuration, label: maxWindowDuration }];
};

const scopeValueProblem = (field: CodeSigningScopeField, value: string) => {
  if (!value) return "Enter a value, or remove this parameter";
  switch (field) {
    case CodeSigningScopeField.SigningApplicationHash:
    case CodeSigningScopeField.DataHash:
      return SHA256_HEX.test(value) ? undefined : "Must be a 64-character SHA-256 hex string";
    case CodeSigningScopeField.IpAddress:
      return z.string().ip().safeParse(value).success ? undefined : "Must be a valid IP address";
    case CodeSigningScopeField.Command:
      return value.length <= MAX_COMMAND_LENGTH
        ? undefined
        : `Must be ${MAX_COMMAND_LENGTH} characters or fewer`;
    default:
      return value.length <= MAX_SCOPE_TEXT_LENGTH
        ? undefined
        : `Must be ${MAX_SCOPE_TEXT_LENGTH} characters or fewer`;
  }
};

const declaredScope = (entries: ScopeEntry[]) => {
  const scope: TCodeSigningScope = {};
  entries.forEach(({ field, value }) => {
    if (value.trim()) scope[field] = value.trim();
  });
  return Object.keys(scope).length ? scope : undefined;
};

type Errors = {
  grantee?: string;
  signings?: string;
  reason?: string;
  scope: Record<string, string>;
};

const ScopeFields = ({
  entries,
  errors,
  onChange
}: {
  entries: ScopeEntry[];
  errors: Record<string, string>;
  onChange: (entries: ScopeEntry[]) => void;
}) => {
  const used = new Set(entries.map((entry) => entry.field));
  const nextUnused = SCOPE_FIELDS.find((field) => !used.has(field));
  const add = () =>
    nextUnused &&
    onChange([...entries, { key: crypto.randomUUID(), field: nextUnused, value: "" }]);
  const patch = (key: string, next: Partial<ScopeEntry>) =>
    onChange(entries.map((entry) => (entry.key === key ? { ...entry, ...next } : entry)));
  return (
    <Field
      group
      label="Scope this request"
      optional
      description="Leave empty to cover any signing. Anything you add must match at signing time, or the call is denied."
    >
      <Stack gap={8}>
        {!entries.length && (
          <EmptyState
            size="sm"
            icon="scan-search"
            title="No parameters added"
            actions={
              <Button variant="outline" icon="plus" onClick={add}>
                Add parameter
              </Button>
            }
          />
        )}
        {entries.map((entry) => (
          <Inline key={entry.key} gap={8} align="start" wrap={false}>
            <Field
              description={`${codeSigningScopeFieldDescriptions[entry.field]} ${codeSigningScopeFieldMatchRules[entry.field]}`}
            >
              <Select
                aria-label="Scope parameter"
                width="md"
                value={entry.field}
                options={SCOPE_FIELDS.map((field) => ({
                  value: field,
                  label: codeSigningScopeFieldLabels[field],
                  disabled: field !== entry.field && used.has(field)
                }))}
                onValueChange={(next) => patch(entry.key, { field: next as CodeSigningScopeField })}
              />
            </Field>
            <InlineGrow>
              <Field error={errors[entry.key]}>
                <Input
                  aria-label={codeSigningScopeFieldLabels[entry.field]}
                  value={entry.value}
                  mono={MONOSPACED_SCOPE_FIELDS.includes(entry.field)}
                  placeholder={PLACEHOLDERS[entry.field]}
                  invalid={Boolean(errors[entry.key])}
                  onChange={(event) => patch(entry.key, { value: event.target.value })}
                />
              </Field>
            </InlineGrow>
            <Button
              variant="ghost"
              icon="trash"
              aria-label={`Remove ${codeSigningScopeFieldLabels[entry.field]}`}
              onClick={() => onChange(entries.filter((item) => item.key !== entry.key))}
            />
          </Inline>
        ))}
        {nextUnused && entries.length > 0 && (
          <div>
            <Button variant="outline" icon="plus" onClick={add}>
              Add parameter
            </Button>
          </div>
        )}
      </Stack>
    </Field>
  );
};

const RequestSheet = ({
  signerId,
  mode,
  onClose
}: {
  signerId: string;
  mode: "request" | "pre-approve";
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("codeSigning");
  const { data: policy } = adapter.useSignerPolicy(signerId);
  const isPreApprove = mode === "pre-approve";
  const users = adapter.useEffectiveSignerMembers({ signerId, kind: "user" });
  const identities = adapter.useEffectiveSignerMembers({ signerId, kind: "identity" });
  const requestToSign = adapter.useRequestToSign();
  const preApprove = adapter.usePreApproveSigning();
  const maxSignings = policy?.constraints.maxSignings ?? null;
  const maxWindowDuration = policy?.constraints.maxWindowDuration ?? null;
  const defaultWindow =
    maxWindowDuration && parseDurationMs(maxWindowDuration) !== null
      ? maxWindowDuration
      : NO_WINDOW;
  const [grantee, setGrantee] = useState("");
  const [signings, setSignings] = useState(maxSignings ? String(maxSignings) : "");
  const [windowDuration, setWindowDuration] = useState(defaultWindow);
  const [scope, setScope] = useState<ScopeEntry[]>([]);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({ scope: {} });
  const submitting = useRef(false);
  const dirty =
    Boolean(grantee || reason || scope.length) ||
    signings !== (maxSignings ? String(maxSignings) : "") ||
    windowDuration !== defaultWindow;
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });

  const memberOptions = [
    ...(users.data?.members ?? [])
      .filter((member) => member.actorUserId && member.role !== SignerMemberRole.Auditor)
      .map((member) => ({
        value: `user:${member.actorUserId}`,
        label:
          member.details?.name ||
          member.details?.username ||
          member.details?.email ||
          (member.actorUserId as string),
        group: "Users"
      })),
    ...(identities.data?.members ?? [])
      .filter((member) => member.actorIdentityId && member.role !== SignerMemberRole.Auditor)
      .map((member) => ({
        value: `identity:${member.actorIdentityId}`,
        label: member.details?.name || (member.actorIdentityId as string),
        group: "Machine identities"
      }))
  ];

  const validate = () => {
    const next: Errors = { scope: {} };
    if (isPreApprove && !grantee) next.grantee = "Pick a member";
    const count = signings.trim() === "" ? null : Number(signings);
    if (count !== null && (!Number.isInteger(count) || count < 1))
      next.signings = "Must be a whole number of at least 1";
    else if (count === null && windowDuration === NO_WINDOW)
      next.signings = "Provide a signature count or an approval duration";
    if (!reason.trim()) next.reason = "Reason is required";
    else if (reason.trim().length > 2048) next.reason = "Must be 2048 characters or fewer";
    scope.forEach((entry) => {
      const problem = scopeValueProblem(entry.field, entry.value.trim());
      if (problem) next.scope[entry.key] = problem;
    });
    setErrors(next);
    return !next.grantee && !next.signings && !next.reason && !Object.keys(next.scope).length;
  };

  const submit = async () => {
    const requestedSignings = signings.trim() === "" ? undefined : Number(signings);
    const requestedWindowDuration = windowDuration === NO_WINDOW ? undefined : windowDuration;
    submitting.current = true;
    try {
      if (isPreApprove) {
        const [kind, ...rest] = grantee.split(":");
        const id = rest.join(":");
        await preApprove
          .mutateAsync({
            signerId,
            granteeUserId: kind === "user" ? id : undefined,
            granteeIdentityId: kind === "identity" ? id : undefined,
            justification: reason.trim(),
            requestedSignings,
            requestedWindowDuration,
            scope: declaredScope(scope)
          })
          .catch(readableFailure("Couldn't pre-approve signing."));
      } else {
        await requestToSign
          .mutateAsync({
            signerId,
            justification: reason.trim(),
            requestedSignings,
            requestedWindowDuration,
            scope: declaredScope(scope)
          })
          .catch(readableFailure("Couldn't send the request."));
      }
      onClose();
    } finally {
      submitting.current = false;
    }
  };

  const signingsHint = maxSignings
    ? `The policy caps each approval at ${maxSignings} signature${maxSignings === 1 ? "" : "s"}.`
    : "Leave empty to rely on the approval duration instead.";
  const windowHint = maxWindowDuration
    ? `Counts down from when access is granted. The policy caps it at ${maxWindowDuration}.`
    : "Counts down from when access is granted. This policy sets no maximum, so the approval can run until its signatures are used up.";

  return (
    <>
      <MultiStep
        variant="sheet"
        size="md"
        title={isPreApprove ? "Pre-approve signing" : "Request to sign"}
        description={
          <>
            {isPreApprove
              ? "Grant an operator or machine identity signing access without a review. It appears with the other approvals, and you can revoke it any time."
              : "Your request goes to this signer's approvers. The approval window starts when it's approved, so waiting for a review doesn't use it up."}{" "}
            <DocumentationLink
              href={isPreApprove ? CODE_SIGNING_DOCS.preApprove : CODE_SIGNING_DOCS.requestToSign}
              subject="Signer approvals"
            />
          </>
        }
        open
        onOpenChange={(next) => {
          if (next || submitting.current) return;
          requestDiscard();
        }}
        completeLabel={isPreApprove ? "Pre-approve" : "Send request"}
        onComplete={submit}
        steps={[
          {
            title: isPreApprove ? "Pre-approval" : "Request",
            validate,
            content: (
              <Stack gap={16}>
                {isPreApprove && (
                  <Field label="Member" error={errors.grantee} wide>
                    <Combobox
                      label="Member"
                      placeholder="Select a member"
                      loading={users.isPending || identities.isPending}
                      invalid={Boolean(errors.grantee)}
                      emptyText="No operators or administrators to pre-approve."
                      options={memberOptions}
                      value={grantee}
                      onValueChange={(next) => {
                        setGrantee(next);
                        setErrors((current) => ({ ...current, grantee: undefined }));
                      }}
                    />
                  </Field>
                )}
                <Field
                  label="How many signatures"
                  description={signingsHint}
                  error={errors.signings}
                >
                  <Input
                    type="number"
                    min={1}
                    max={maxSignings ?? undefined}
                    width="sm"
                    value={signings}
                    placeholder={maxSignings ? `Up to ${maxSignings}` : "Unlimited"}
                    invalid={Boolean(errors.signings)}
                    onChange={(event) => {
                      setSignings(event.target.value);
                      setErrors((current) => ({ ...current, signings: undefined }));
                    }}
                  />
                </Field>
                <Field label="How long the approval lasts" description={windowHint}>
                  <Select
                    aria-label="How long the approval lasts"
                    width="md"
                    value={windowDuration}
                    options={windowOptions(maxWindowDuration)}
                    onValueChange={(next) => {
                      setWindowDuration(next);
                      setErrors((current) => ({ ...current, signings: undefined }));
                    }}
                  />
                </Field>
                <ScopeFields entries={scope} errors={errors.scope} onChange={setScope} />
                <Field label="Reason" error={errors.reason} wide>
                  <Textarea
                    rows={3}
                    value={reason}
                    placeholder={
                      isPreApprove ? "Why is this being pre-approved?" : "What are you signing?"
                    }
                    aria-invalid={Boolean(errors.reason)}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setErrors((current) => ({ ...current, reason: undefined }));
                    }}
                  />
                </Field>
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description={
          isPreApprove ? "Your pre-approval will be lost." : "Your signing request will be lost."
        }
      />
    </>
  );
};

export const SignerRequestSheet = ({
  signerId,
  mode,
  onClose
}: {
  signerId: string;
  mode?: "request" | "pre-approve";
  onClose: () => void;
}) => (mode ? <RequestSheet signerId={signerId} mode={mode} onClose={onClose} /> : null);
