import { useId, useMemo, useState } from "react";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { useAutosave } from "@infisical/cipher/ui/settings-card";
import { SheetBody, SheetSections } from "@infisical/cipher/ui/sheet";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { Switch } from "@infisical/cipher/ui/switch";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import {
  type ApiDraft,
  countText,
  ENROLLMENT_DOCS,
  type EnrollmentPanelProps,
  parseCount,
  withDraft
} from "./enrollment-model";
import { EnrollmentFooter } from "./enrollment-shared";

const renewBeforeError = (raw: string) => {
  const days = parseCount(raw);
  return days === null || (days >= 1 && days <= 365) ? undefined : "Enter a number from 1 to 365";
};

const toPayload = (value: ApiDraft) => ({
  autoRenew: value.autoRenew,
  renewBeforeDays: value.autoRenew ? (parseCount(value.renewBeforeDays) ?? undefined) : undefined
});

const ApiFields = ({
  value,
  error,
  disabled,
  onToggle,
  onDaysChange,
  onDaysCommit
}: {
  value: ApiDraft;
  error?: string;
  disabled?: boolean;
  onToggle: (autoRenew: boolean) => void;
  onDaysChange: (days: string) => void;
  onDaysCommit?: () => void;
}) => (
  <Stack gap={24}>
    <FieldSet legend="Endpoint">
      <Field
        label="API endpoint URL"
        description="Send a POST with applicationId, profileId and an attributes object to issue a certificate."
        help={
          <DocumentationLink href={ENROLLMENT_DOCS.apiReference} subject="the certificates API" />
        }
      >
        <Snippet
          label="API endpoint URL"
          copyLabel="Copy API endpoint URL"
          value={`${window.location.origin}/api/v1/cert-manager/certificates`}
        />
      </Field>
    </FieldSet>
    <FieldSet legend="Renewal">
      <Switch
        layout="row"
        label="Auto-renew"
        description="Renew certificates issued through this profile before they expire."
        checked={value.autoRenew}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
      {value.autoRenew && (
        <Field
          label="Renew before (days)"
          optional
          description="How many days before expiry renewal starts."
          error={error}
        >
          <Input
            width="xs"
            inputMode="numeric"
            placeholder="30"
            value={value.renewBeforeDays}
            invalid={Boolean(error)}
            disabled={disabled}
            onChange={(event) => onDaysChange(event.target.value)}
            onBlur={onDaysCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") onDaysCommit?.();
            }}
          />
        </Field>
      )}
    </FieldSet>
  </Stack>
);

const ConfiguredApi = ({
  applicationId,
  profileId,
  state,
  header,
  busy,
  onCancel
}: EnrollmentPanelProps<"api">) => {
  const adapter = useV4Adapter("pkiApplications");
  const set = adapter.useSetApiEnrollment();
  const clear = adapter.useClearApiEnrollment();
  const [error, setError] = useState<string>();
  const autoRenew = Boolean(state.api?.autoRenew);
  const renewBeforeDays = countText(state.api?.renewBeforeDays);
  const stored = useMemo(() => ({ autoRenew, renewBeforeDays }), [autoRenew, renewBeforeDays]);
  const { value, edit, save, pending } = useAutosave({
    value: stored,
    errorMessage: "Couldn't update API enrollment. Try again.",
    onSave: async (next) => {
      await set.mutateAsync({ applicationId, profileId, ...toPayload(next) });
      saved("API enrollment updated");
    }
  });
  return (
    <SheetSections
      header={header}
      footer={
        <EnrollmentFooter
          method="api"
          configured
          dirty={false}
          pending={pending}
          busy={busy || pending}
          onCancel={onCancel}
          applicationId={applicationId}
          profileId={profileId}
          clear={clear}
        />
      }
    >
      <SheetBody>
        <ApiFields
          value={value}
          error={error}
          disabled={pending}
          onToggle={(next) => {
            setError(undefined);
            save({ autoRenew: next, renewBeforeDays: next ? value.renewBeforeDays : "" });
          }}
          onDaysChange={(days) => {
            setError(undefined);
            edit({ ...value, renewBeforeDays: days });
          }}
          onDaysCommit={() => {
            const issue = renewBeforeError(value.renewBeforeDays);
            setError(issue);
            if (!issue) save();
          }}
        />
      </SheetBody>
    </SheetSections>
  );
};

const NewApi = ({
  applicationId,
  profileId,
  header,
  draft,
  onDraft,
  onSaved,
  onCancel,
  busy,
  run
}: EnrollmentPanelProps<"api">) => {
  const adapter = useV4Adapter("pkiApplications");
  const set = adapter.useSetApiEnrollment();
  const clear = adapter.useClearApiEnrollment();
  const formId = useId();
  const [error, setError] = useState<string>();
  const { value, change } = withDraft<ApiDraft>(
    { autoRenew: false, renewBeforeDays: "" },
    draft,
    onDraft
  );
  const submit = async () => {
    const issue = value.autoRenew ? renewBeforeError(value.renewBeforeDays) : undefined;
    setError(issue);
    if (issue) return;
    try {
      await run(() => set.mutateAsync({ applicationId, profileId, ...toPayload(value) }));
      saved("API enrollment enabled");
      onSaved();
    } catch (cause) {
      failed("Couldn't enable API enrollment", cause);
    }
  };
  return (
    <SheetSections
      header={header}
      footer={
        <EnrollmentFooter
          method="api"
          configured={false}
          formId={formId}
          dirty
          pending={busy}
          busy={busy}
          onCancel={onCancel}
          applicationId={applicationId}
          profileId={profileId}
          clear={clear}
        />
      }
    >
      <SheetBody>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <ApiFields
            value={value}
            error={error}
            onToggle={(autoRenew) => change({ autoRenew })}
            onDaysChange={(renewBeforeDays) => {
              setError(undefined);
              change({ renewBeforeDays });
            }}
          />
        </form>
      </SheetBody>
    </SheetSections>
  );
};

export const ApiEnrollmentPanel = (props: EnrollmentPanelProps<"api">) =>
  props.state.api ? <ConfiguredApi {...props} /> : <NewApi {...props} />;
