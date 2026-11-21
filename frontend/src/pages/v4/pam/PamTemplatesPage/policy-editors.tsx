import { Alert } from "@infisical/cipher/ui/alert";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";

import {
  PamAccountType,
  PamOutputMaskingPreset,
  type TPamPolicyDescriptor
} from "@app/hooks/api/pam";

export type PolicyEditorProps = {
  policy: TPamPolicyDescriptor;
  accountType: PamAccountType;
  value: unknown;
  draft?: string;
  onDraft: (draft?: string) => void;
  onSave: (value: unknown) => Promise<boolean>;
  pending: boolean;
};

const DEFAULT_PATTERN_PLACEHOLDER =
  "rm\\s+-rf.*\npassword\\s*=\\s*\\S+\n\\b\\d{3}-\\d{2}-\\d{4}\\b";
const SQL_PATTERN_PLACEHOLDER = "^\\s*drop\\b\n\\btruncate\\b\n^\\s*grant\\b";
const COMMAND_BLOCKING_PLACEHOLDERS: Partial<Record<PamAccountType, string>> = {
  [PamAccountType.Snowflake]: SQL_PATTERN_PLACEHOLDER,
  [PamAccountType.ClickHouse]: SQL_PATTERN_PLACEHOLDER
};
const MASKING_PLACEHOLDER = "acme_[a-z0-9]{24}\ninternal-vault://\\S+";

const commitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
  if (event.key === "Enter") event.currentTarget.blur();
};

export const BooleanPolicyEditor = ({ policy, value, onSave, pending }: PolicyEditorProps) => (
  <Switch
    layout="row"
    label={policy.label}
    description={policy.description}
    checked={value === true}
    disabled={pending}
    onCheckedChange={(checked) => onSave(checked)}
  />
);

export const DurationPolicyEditor = ({
  policy,
  value,
  draft,
  onDraft,
  onSave
}: PolicyEditorProps) => {
  const stored = typeof value === "number" ? String(value) : "";
  return (
    <Field label={policy.label} description={policy.description}>
      <Input
        type="number"
        width="sm"
        placeholder="3600"
        value={draft ?? stored}
        onChange={(event) =>
          onDraft(event.target.value === stored ? undefined : event.target.value)
        }
        onKeyDown={commitOnEnter}
        onBlur={() => {
          if (draft === undefined) return;
          const parsed = Number(draft);
          onSave(draft === "" || Number.isNaN(parsed) ? null : parsed);
        }}
        onWheel={(event) => event.currentTarget.blur()}
      />
    </Field>
  );
};

export const CommandBlockingEditor = ({
  policy,
  accountType,
  value,
  draft,
  onDraft,
  onSave
}: PolicyEditorProps) => {
  const stored = typeof value === "string" ? value : "";
  return (
    <Field label={policy.label} description={policy.description}>
      <Textarea
        mono
        rows={5}
        placeholder={COMMAND_BLOCKING_PLACEHOLDERS[accountType] ?? DEFAULT_PATTERN_PLACEHOLDER}
        value={draft ?? stored}
        onChange={(event) =>
          onDraft(event.target.value === stored ? undefined : event.target.value)
        }
        onBlur={() => {
          if (draft === undefined) return;
          onSave(draft.trim() ? draft : null);
        }}
      />
    </Field>
  );
};

const PRESETS: { value: PamOutputMaskingPreset; label: string; meta: string }[] = [
  {
    value: PamOutputMaskingPreset.AccountCredentials,
    label: "Account credentials",
    meta: "password, keys, tokens"
  },
  { value: PamOutputMaskingPreset.Email, label: "Email addresses", meta: "jane@acme.com" },
  { value: PamOutputMaskingPreset.PhoneNumber, label: "Phone numbers", meta: "(555) 123-4567" },
  { value: PamOutputMaskingPreset.Ssn, label: "Social Security numbers", meta: "123-45-6789" },
  {
    value: PamOutputMaskingPreset.CreditCard,
    label: "Credit card numbers",
    meta: "4111 1111 1111 1111"
  },
  { value: PamOutputMaskingPreset.IpAddress, label: "IPv4 addresses", meta: "192.168.1.10" },
  { value: PamOutputMaskingPreset.Jwt, label: "JSON Web Tokens", meta: "header.payload.signature" },
  {
    value: PamOutputMaskingPreset.ConnectionString,
    label: "Connection string passwords",
    meta: "passwords in URLs"
  }
];

type TOutputMasking = { presets: PamOutputMaskingPreset[]; patterns: string };

const parseMasking = (value: unknown): TOutputMasking => {
  const masking = (value ?? {}) as Partial<TOutputMasking>;
  return {
    presets: Array.isArray(masking.presets) ? masking.presets : [],
    patterns: typeof masking.patterns === "string" ? masking.patterns : ""
  };
};

export const OutputMaskingPolicyEditor = ({
  policy,
  value,
  draft,
  onDraft,
  onSave,
  pending
}: PolicyEditorProps) => {
  const { presets, patterns } = parseMasking(value);
  const save = (next: TOutputMasking) =>
    onSave(next.presets.length > 0 || next.patterns.trim() ? next : null);

  return (
    <Field group label={policy.label} description={policy.description}>
      <Stack gap={16}>
        <Field label="Presets">
          <Combobox
            multiple
            label="Presets"
            placeholder="Select presets..."
            clearable
            clearLabel="Clear all presets"
            disabled={pending}
            options={PRESETS}
            value={presets}
            onValueChange={(next) => save({ patterns, presets: next as PamOutputMaskingPreset[] })}
          />
        </Field>
        <Field
          label="Custom patterns"
          description="One regex per line, masked in addition to the presets."
        >
          <Textarea
            mono
            rows={3}
            placeholder={MASKING_PLACEHOLDER}
            value={draft ?? patterns}
            onChange={(event) =>
              onDraft(event.target.value === patterns ? undefined : event.target.value)
            }
            onBlur={() => {
              if (draft !== undefined) save({ presets, patterns: draft });
            }}
          />
        </Field>
        <Alert tone="warn" title="Output masking is best effort">
          Masking hides values from accidental exposure, such as an AI agent reading query results.
          A user who wants to see them can get around it, for example by encoding the data first.
        </Alert>
      </Stack>
    </Field>
  );
};
