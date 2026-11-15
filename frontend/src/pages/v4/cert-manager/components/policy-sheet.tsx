import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { Field, FieldError, FieldHelp } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Grid, Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { Separator } from "@infisical/cipher/ui/separator";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText, Text } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { PostQuantumCertificatesUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import type { TCertificatePolicy } from "@app/hooks/api/certificatePolicies/types";
import { isPqcAlgorithm } from "@app/hooks/api/certificates/constants";

import { useOrgId } from "../../access/permissions";
import { readableFailure, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license";
import {
  applyPreset,
  CRITICALITY_LABELS,
  type Criticality,
  domainComponentChain,
  DURATION_UNITS,
  type DurationUnit,
  EFFECT_OPTIONS,
  emptyPolicyDraft,
  EXTENDED_KEY_USAGES,
  extensionLabel,
  type ExtensionRule,
  isPresetExtension,
  isValidDomainComponentSequence,
  KEY_ALGORITHMS,
  KEY_USAGES,
  OID_PATTERN,
  oidOptions,
  POLICY_PRESETS,
  POLICY_STATE_LABELS,
  POLICY_STATE_OPTIONS,
  type PolicyDraft,
  policyDraftOf,
  type PolicyErrors,
  type PolicyRestrictions,
  type PolicyState,
  policyStepErrors,
  policyToApi,
  presetCriticality,
  type RuleEffect,
  ruleKey,
  SAN_LABELS,
  SAN_PLACEHOLDERS,
  SAN_TYPES,
  type SanType,
  SIGNATURE_ALGORITHMS,
  SUBJECT_LABELS,
  SUBJECT_PLACEHOLDERS,
  SUBJECT_TYPES,
  type SubjectType,
  type UsageRules,
  usageEffect,
  usageLabel,
  withUsageEffect
} from "./policy-model";

const ANY_CRITICALITY = "any";

const SectionToggle = ({
  label,
  checked,
  onCheckedChange,
  error,
  children
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
  children?: React.ReactNode;
}) => (
  <Stack gap={12}>
    <Switch layout="row" label={label} checked={checked} onCheckedChange={onCheckedChange} />
    {checked && children}
    {error && <FieldError>{error}</FieldError>}
  </Stack>
);

const subjectOptions = SUBJECT_TYPES.map((value) => ({
  value,
  label: SUBJECT_LABELS[value]
}));
const sanOptions = SAN_TYPES.map((value) => ({
  value,
  label: SAN_LABELS[value]
}));

const RuleRow = ({
  label,
  type,
  options,
  effect,
  value,
  placeholder,
  trailing,
  onChange,
  onRemove
}: {
  label: string;
  type: string;
  options: { value: string; label: string }[];
  effect: RuleEffect;
  value: string;
  placeholder: string;
  trailing?: React.ReactNode;
  onChange: (patch: { type?: string; effect?: RuleEffect; value?: string }) => void;
  onRemove: () => void;
}) => (
  <Inline gap={8} align="center" wrap={false}>
    <Select
      aria-label={`${label} type`}
      width="md"
      options={options}
      value={type}
      onChange={(next) => onChange({ type: next })}
    />
    <Select
      aria-label={`${label} rule`}
      width="xs"
      options={EFFECT_OPTIONS}
      value={effect}
      onChange={(next) => onChange({ effect: next as RuleEffect })}
    />
    <InlineGrow>
      <Input
        aria-label={`${label} value`}
        mono
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        trailing={trailing}
        onChange={(event) => onChange({ value: event.target.value })}
      />
    </InlineGrow>
    <Button variant="ghost" icon="trash" iconOnly onClick={onRemove}>
      {`Remove ${label.toLowerCase()}`}
    </Button>
  </Inline>
);

const domainComponentPreview = (effect: RuleEffect, value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isValidDomainComponentSequence(trimmed))
    return "Every component must be non-empty, for example corp,example,com.";
  const verb = { require: "Requires", allow: "Allows", deny: "Denies" }[effect];
  const scope =
    effect === "deny"
      ? " wherever they appear in the chain"
      : (trimmed.includes(",") && " in this order") || "";
  return `${verb} ${domainComponentChain(trimmed)}${scope}`;
};

const UsageGrid = ({
  options,
  rules,
  onChange
}: {
  options: readonly string[];
  rules: UsageRules;
  onChange: (rules: UsageRules) => void;
}) => (
  <Grid columns={2} gap={12}>
    {options.map((usage) => (
      <Inline key={usage} gap={8} align="center" justify="between" wrap={false}>
        <Text>{usageLabel(usage)}</Text>
        <Select
          aria-label={usageLabel(usage)}
          size="sm"
          width="xs"
          options={EFFECT_OPTIONS}
          value={usageEffect(rules, usage)}
          onChange={(next) => onChange(withUsageEffect(rules, usage, next as RuleEffect))}
        />
      </Inline>
    ))}
  </Grid>
);

type ExtensionDraft = Omit<ExtensionRule, "key">;

const emptyExtension: ExtensionDraft = {
  oid: "",
  label: "",
  effect: "allowed",
  critical: "",
  value: "*"
};

const ExtensionRuleDialog = ({
  rule,
  onSave,
  onClose
}: {
  rule?: ExtensionRule;
  onSave: (rule: ExtensionDraft) => void;
  onClose: () => void;
}) => {
  const [draft, setDraft] = useState<ExtensionDraft>(rule ?? emptyExtension);
  const [error, setError] = useState<string>();
  const preset = isPresetExtension(draft.oid);
  const set = (patch: Partial<ExtensionDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const confirm = () => {
    const oid = draft.oid.trim();
    if (!OID_PATTERN.test(oid)) {
      setError("Enter a valid object identifier, for example 1.3.6.1.4.1.311.25.2");
      return;
    }
    onSave({
      ...draft,
      oid,
      label: preset ? "" : draft.label.trim(),
      critical: preset ? "" : draft.critical,
      value: draft.value.trim() || "*"
    });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            confirm();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {rule ? "Edit custom extension rule" : "Add custom extension rule"}
            </DialogTitle>
          </DialogHeader>
          <Stack gap={16}>
            <Field
              label="Object identifier"
              description="Add several rules for one OID to accept more than one value."
              error={error}
            >
              <Combobox
                label="Object identifier"
                placeholder="Select or enter an OID"
                mono
                invalid={Boolean(error)}
                options={oidOptions([draft.oid])}
                value={draft.oid}
                onChange={(oid) => {
                  set({ oid });
                  setError(undefined);
                }}
                onCreate={(oid) => {
                  set({ oid: oid.trim() });
                  setError(undefined);
                }}
                createLabel={(query) => `Use ${query}`}
              />
            </Field>
            <Field
              label="Name"
              optional={!preset}
              description={preset ? "Infisical names this extension." : undefined}
            >
              <Input
                placeholder="Device compliance marker"
                value={preset ? extensionLabel(draft.oid) : draft.label}
                disabled={preset}
                autoComplete="off"
                onChange={(event) => set({ label: event.target.value })}
              />
            </Field>
            <Field label="Rule">
              <Select
                aria-label="Rule"
                options={(["allowed", "required", "denied"] as const).map((value) => ({
                  value,
                  label: POLICY_STATE_LABELS[value]
                }))}
                value={draft.effect}
                onChange={(effect) => set({ effect: effect as PolicyState })}
              />
            </Field>
            <Field
              label="Criticality"
              description={preset ? "Fixed by this extension's specification." : undefined}
            >
              <Select
                aria-label="Criticality"
                disabled={preset}
                options={[
                  { value: ANY_CRITICALITY, label: CRITICALITY_LABELS[""] },
                  { value: "critical", label: CRITICALITY_LABELS.critical },
                  {
                    value: "not_critical",
                    label: CRITICALITY_LABELS.not_critical
                  }
                ]}
                value={(preset ? presetCriticality(draft.oid) : draft.critical) || ANY_CRITICALITY}
                onChange={(next) =>
                  set({
                    critical: next === ANY_CRITICALITY ? "" : (next as Criticality)
                  })
                }
              />
            </Field>
            <Field
              label="Value pattern"
              description="One value this rule matches, with * as a wildcard. Use * alone for any value."
            >
              <Input
                mono
                placeholder="*"
                value={draft.value}
                autoComplete="off"
                onChange={(event) => set({ value: event.target.value })}
              />
            </Field>
          </Stack>
          <DialogFooter>
            <Inline gap={8} justify="end">
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                {rule ? "Save rule" : "Add rule"}
              </Button>
            </Inline>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const STEP_TITLES = [
  "Basics",
  "Subject",
  "Algorithms",
  "Key usages",
  "Custom extensions",
  "Constraints"
];

type StepProps = {
  draft: PolicyDraft;
  errors: PolicyErrors;
  setDraft: React.Dispatch<React.SetStateAction<PolicyDraft>>;
  setErrors: React.Dispatch<React.SetStateAction<PolicyErrors>>;
  change: (patch: Partial<PolicyDraft>, clear?: keyof PolicyErrors) => void;
  restrict: (key: keyof PolicyRestrictions, on: boolean, reset?: Partial<PolicyDraft>) => void;
};

const BasicsStep = ({
  draft,
  errors,
  setDraft,
  setErrors,
  isEdit,
  defaultName
}: Pick<StepProps, "draft" | "errors" | "setDraft" | "setErrors"> & {
  isEdit: boolean;
  defaultName?: string;
}) => {
  return (
    <Stack gap={16}>
      <Field
        label="Policy name"
        description={
          defaultName
            ? "Pre-filled from the profile name. Edit it if other profiles will share this policy."
            : undefined
        }
        error={errors.name}
        wide
      >
        <Input
          value={draft.name}
          invalid={Boolean(errors.name)}
          placeholder="tls-server"
          autoComplete="off"
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              name: event.target.value
            }))
          }
        />
      </Field>
      <Field label="Description" optional error={errors.description} wide>
        <Textarea
          rows={3}
          value={draft.description}
          placeholder="What this policy enforces"
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              description: event.target.value
            }))
          }
        />
      </Field>
      <Field
        label="Preset"
        description="Fills every step with a recommended baseline that you can refine."
        wide
      >
        <Select
          aria-label="Preset"
          options={[
            { value: "custom", label: "Custom" },
            ...POLICY_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.name
            }))
          ]}
          value={draft.preset}
          onChange={(presetId) => {
            setErrors({});
            setDraft((current) => {
              const next = applyPreset(current, presetId);
              return isEdit || current.name || presetId === "custom"
                ? next
                : { ...next, name: presetId };
            });
          }}
        />
      </Field>
    </Stack>
  );
};

const SubjectStep = ({
  draft,
  errors,
  change,
  restrict
}: Pick<StepProps, "draft" | "errors" | "change" | "restrict">) => {
  const updateAttribute = (
    key: string,
    patch: { type?: string; effect?: RuleEffect; value?: string }
  ) =>
    change(
      {
        attributes: draft.attributes.map((rule) =>
          rule.key === key
            ? {
                ...rule,
                ...patch,
                type: (patch.type ?? rule.type) as SubjectType
              }
            : rule
        )
      },
      "subject"
    );
  const updateSan = (key: string, patch: { type?: string; effect?: RuleEffect; value?: string }) =>
    change(
      {
        sans: draft.sans.map((rule) =>
          rule.key === key
            ? { ...rule, ...patch, type: (patch.type ?? rule.type) as SanType }
            : rule
        )
      },
      "sans"
    );
  return (
    <Stack gap={24}>
      <SectionToggle
        label="Restrict subject attributes"
        checked={draft.restrict.subject}
        error={errors.subject}
        onCheckedChange={(on) => restrict("subject", on, { attributes: [] })}
      >
        <Stack gap={12}>
          {draft.attributes.length === 0 && (
            <SmallText muted>
              No attributes yet, so certificates from this policy cannot include any subject
              attributes.
            </SmallText>
          )}
          {draft.attributes.map((rule) => {
            const preview =
              rule.type === "domain_component"
                ? domainComponentPreview(rule.effect, rule.value)
                : null;
            return (
              <Stack key={rule.key} gap={4}>
                <RuleRow
                  label="Subject attribute"
                  type={rule.type}
                  options={subjectOptions}
                  effect={rule.effect}
                  value={rule.value}
                  placeholder={SUBJECT_PLACEHOLDERS[rule.type]}
                  trailing={
                    rule.type === "domain_component" ? (
                      <FieldHelp label="Domain component format">
                        Enter the components most specific first, separated by commas:
                        corp,example,com matches DC=corp,DC=example,DC=com. A * matches one
                        component. A denied chain is rejected wherever it appears.
                      </FieldHelp>
                    ) : undefined
                  }
                  onChange={(patch) => updateAttribute(rule.key, patch)}
                  onRemove={() =>
                    change({
                      attributes: draft.attributes.filter((entry) => entry.key !== rule.key)
                    })
                  }
                />
                {preview && <SmallText muted>{preview}</SmallText>}
              </Stack>
            );
          })}
          <div>
            <Button
              variant="outline"
              size="sm"
              icon="plus"
              onClick={() =>
                change(
                  {
                    attributes: [
                      ...draft.attributes,
                      {
                        key: ruleKey(),
                        type: "common_name",
                        effect: "allow",
                        value: ""
                      }
                    ]
                  },
                  "subject"
                )
              }
            >
              Add attribute
            </Button>
          </div>
        </Stack>
      </SectionToggle>
      <Separator />
      <SectionToggle
        label="Restrict subject alternative names"
        checked={draft.restrict.sans}
        error={errors.sans}
        onCheckedChange={(on) => restrict("sans", on, { sans: [] })}
      >
        <Stack gap={12}>
          {draft.sans.length === 0 && (
            <SmallText muted>
              No SANs yet, so certificates from this policy cannot include any subject alternative
              names.
            </SmallText>
          )}
          {draft.sans.map((rule) => (
            <RuleRow
              key={rule.key}
              label="SAN"
              type={rule.type}
              options={sanOptions}
              effect={rule.effect}
              value={rule.value}
              placeholder={SAN_PLACEHOLDERS[rule.type]}
              onChange={(patch) => updateSan(rule.key, patch)}
              onRemove={() =>
                change({
                  sans: draft.sans.filter((entry) => entry.key !== rule.key)
                })
              }
            />
          ))}
          <div>
            <Button
              variant="outline"
              size="sm"
              icon="plus"
              onClick={() =>
                change(
                  {
                    sans: [
                      ...draft.sans,
                      {
                        key: ruleKey(),
                        type: "dns_name",
                        effect: "allow",
                        value: ""
                      }
                    ]
                  },
                  "sans"
                )
              }
            >
              Add SAN
            </Button>
          </div>
        </Stack>
      </SectionToggle>
    </Stack>
  );
};

const AlgorithmsStep = ({
  draft,
  errors,
  change,
  restrict,
  setErrors,
  pqcLocked,
  onPqcBlocked
}: Pick<StepProps, "draft" | "errors" | "change" | "restrict" | "setErrors"> & {
  pqcLocked: boolean;
  onPqcBlocked: () => void;
}) => {
  const selected = {
    signatureAlgorithms: new Set(draft.signatureAlgorithms),
    keyAlgorithms: new Set(draft.keyAlgorithms)
  };
  const toggleAlgorithm = (
    key: "signatureAlgorithms" | "keyAlgorithms",
    algorithm: string,
    checked: boolean,
    clear: keyof PolicyErrors
  ) => {
    if (checked && pqcLocked && isPqcAlgorithm(algorithm)) {
      onPqcBlocked();
      return;
    }
    change(
      {
        [key]: checked
          ? [...draft[key], algorithm]
          : draft[key].filter((entry) => entry !== algorithm)
      },
      clear
    );
  };
  const algorithmGrid = (
    options: readonly string[],
    key: "signatureAlgorithms" | "keyAlgorithms",
    clear: keyof PolicyErrors
  ) => (
    <Grid columns={2} gap={12}>
      {options.map((algorithm) => (
        <Checkbox
          key={algorithm}
          label={
            pqcLocked && isPqcAlgorithm(algorithm) ? (
              <Inline gap={8} align="center">
                {algorithm}
                <Badge size="sm" tone="info">
                  Enterprise
                </Badge>
              </Inline>
            ) : (
              algorithm
            )
          }
          checked={selected[key].has(algorithm)}
          onCheckedChange={(checked) => toggleAlgorithm(key, algorithm, checked === true, clear)}
        />
      ))}
    </Grid>
  );
  return (
    <Stack gap={24}>
      <SectionToggle
        label="Restrict signature algorithms"
        checked={draft.restrict.signature}
        error={errors.signature}
        onCheckedChange={(on) => {
          restrict("signature", on, { signatureAlgorithms: [] });
          setErrors((current) => ({
            ...current,
            signature: undefined
          }));
        }}
      >
        {algorithmGrid(SIGNATURE_ALGORITHMS, "signatureAlgorithms", "signature")}
      </SectionToggle>
      <Separator />
      <SectionToggle
        label="Restrict key algorithms"
        checked={draft.restrict.keyAlgorithm}
        error={errors.keyAlgorithm}
        onCheckedChange={(on) => {
          restrict("keyAlgorithm", on, { keyAlgorithms: [] });
          setErrors((current) => ({
            ...current,
            keyAlgorithm: undefined
          }));
        }}
      >
        {algorithmGrid(KEY_ALGORITHMS, "keyAlgorithms", "keyAlgorithm")}
      </SectionToggle>
    </Stack>
  );
};

const UsagesStep = ({
  draft,
  change,
  restrict
}: Pick<StepProps, "draft" | "change" | "restrict">) => {
  return (
    <Stack gap={24}>
      <SectionToggle
        label="Restrict key usages"
        checked={draft.restrict.keyUsages}
        onCheckedChange={(on) =>
          restrict("keyUsages", on, {
            keyUsages: { required: [], allowed: [] }
          })
        }
      >
        <UsageGrid
          options={KEY_USAGES}
          rules={draft.keyUsages}
          onChange={(keyUsages) => change({ keyUsages })}
        />
      </SectionToggle>
      <Separator />
      <SectionToggle
        label="Restrict extended key usages"
        checked={draft.restrict.extendedKeyUsages}
        onCheckedChange={(on) =>
          restrict("extendedKeyUsages", on, {
            extendedKeyUsages: { required: [], allowed: [] }
          })
        }
      >
        <UsageGrid
          options={EXTENDED_KEY_USAGES}
          rules={draft.extendedKeyUsages}
          onChange={(extendedKeyUsages) => change({ extendedKeyUsages })}
        />
      </SectionToggle>
    </Stack>
  );
};

const ExtensionsStep = ({
  draft,
  errors,
  change,
  restrict,
  setErrors
}: Pick<StepProps, "draft" | "errors" | "change" | "restrict" | "setErrors">) => {
  const [editingRule, setEditingRule] = useState<ExtensionRule | "new">();
  const extensionColumns: DataTableColumn<ExtensionRule>[] = [
    {
      id: "extension",
      header: "Extension",
      primary: true,
      grow: true,
      text: (rule) => extensionLabel(rule.oid, rule.label),
      secondary: (rule) => rule.oid
    },
    {
      id: "rule",
      header: "Rule",
      width: 96,
      text: (rule) => POLICY_STATE_LABELS[rule.effect]
    },
    {
      id: "criticality",
      header: "Criticality",
      width: 200,
      wrap: true,
      text: (rule) => CRITICALITY_LABELS[rule.critical]
    },
    {
      id: "value",
      header: "Value pattern",
      width: 160,
      mono: true,
      text: (rule) => rule.value
    }
  ];

  return (
    <>
      <SectionToggle
        label="Restrict custom extensions"
        checked={draft.restrict.customExtensions}
        error={errors.extensions}
        onCheckedChange={(on) => {
          restrict("customExtensions", on, { customExtensions: [] });
          setErrors((current) => ({
            ...current,
            extensions: undefined
          }));
        }}
      >
        <Stack gap={12}>
          {draft.customExtensions.length === 0 ? (
            <SmallText muted>
              No rules yet, so certificates from this policy cannot include any custom extensions.
            </SmallText>
          ) : (
            <DataTable
              label="Custom extension rules"
              rows={draft.customExtensions}
              columns={extensionColumns}
              getRowId={(rule) => rule.key}
              rowLabel={(rule) => extensionLabel(rule.oid, rule.label)}
              rowActions={{
                renderMenu: (rule) => (
                  <>
                    <DropdownMenuItem onSelect={() => setEditingRule(rule)}>
                      <Icon name="pencil" />
                      Edit rule
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() =>
                        change(
                          {
                            customExtensions: draft.customExtensions.filter(
                              (entry) => entry.key !== rule.key
                            )
                          },
                          "extensions"
                        )
                      }
                    >
                      <Icon name="trash" />
                      Remove rule
                    </DropdownMenuItem>
                  </>
                )
              }}
            />
          )}
          <div>
            <Button variant="outline" size="sm" icon="plus" onClick={() => setEditingRule("new")}>
              Add rule
            </Button>
          </div>
        </Stack>
      </SectionToggle>

      {editingRule && (
        <ExtensionRuleDialog
          rule={editingRule === "new" ? undefined : editingRule}
          onClose={() => setEditingRule(undefined)}
          onSave={(rule) =>
            change(
              {
                customExtensions:
                  editingRule === "new"
                    ? [...draft.customExtensions, { ...rule, key: ruleKey() }]
                    : draft.customExtensions.map((entry) =>
                        entry.key === editingRule.key ? { ...rule, key: entry.key } : entry
                      )
              },
              "extensions"
            )
          }
        />
      )}
    </>
  );
};

const ConstraintsStep = ({
  draft,
  change,
  restrict
}: Pick<StepProps, "draft" | "change" | "restrict">) => {
  return (
    <Stack gap={24}>
      <SectionToggle
        label="Set maximum validity"
        checked={draft.restrict.validity}
        onCheckedChange={(on) => restrict("validity", on)}
      >
        <Inline gap={12} align="end">
          <Field label="Duration">
            <Input
              type="number"
              min={1}
              width="xs"
              value={draft.validity.value}
              onChange={(event) =>
                change({
                  validity: {
                    ...draft.validity,
                    value: event.target.value
                  }
                })
              }
              onBlur={() => {
                const parsed = Number.parseInt(draft.validity.value, 10);
                change({
                  validity: {
                    ...draft.validity,
                    value: parsed > 0 ? String(parsed) : "365"
                  }
                });
              }}
            />
          </Field>
          <Field label="Unit">
            <Select
              aria-label="Unit"
              width="sm"
              options={DURATION_UNITS}
              value={draft.validity.unit}
              onChange={(unit) =>
                change({
                  validity: {
                    ...draft.validity,
                    unit: unit as DurationUnit
                  }
                })
              }
            />
          </Field>
        </Inline>
      </SectionToggle>
      <Separator />
      <SectionToggle
        label="Configure basic constraints"
        checked={draft.restrict.basicConstraints}
        onCheckedChange={(on) => restrict("basicConstraints", on)}
      >
        <Stack gap={16}>
          <Field label="CA certificate (isCA)" wide>
            <Select
              aria-label="CA certificate"
              options={POLICY_STATE_OPTIONS}
              value={draft.basicConstraints.isCA}
              onChange={(isCA) =>
                change({
                  basicConstraints: {
                    isCA: isCA as PolicyState,
                    maxPathLength: isCA === "denied" ? "" : draft.basicConstraints.maxPathLength
                  }
                })
              }
            />
          </Field>
          {draft.basicConstraints.isCA !== "denied" && (
            <Field
              label="Maximum path length"
              optional
              description="How many sub-CA levels can exist below this certificate. Leave empty for no limit."
              wide
            >
              <Input
                type="number"
                min={0}
                width="xs"
                value={draft.basicConstraints.maxPathLength}
                onChange={(event) =>
                  change({
                    basicConstraints: {
                      ...draft.basicConstraints,
                      maxPathLength: event.target.value
                    }
                  })
                }
              />
            </Field>
          )}
        </Stack>
      </SectionToggle>
    </Stack>
  );
};

export const CertificatePolicySheet = ({
  projectId,
  policy,
  defaultName,
  onCreated,
  onClose
}: {
  projectId: string;
  policy?: TCertificatePolicy;
  defaultName?: string;
  onCreated?: (policy: TCertificatePolicy) => void;
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("pkiPolicies");
  const create = adapter.useCreatePolicy();
  const update = adapter.useUpdatePolicy();
  const { data: subscription } = adapter.useSubscription(useOrgId());
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [initial] = useState(() =>
    policy ? policyDraftOf(policy) : emptyPolicyDraft(defaultName)
  );
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<PolicyErrors>({});
  const [step, setStep] = useState(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });

  const change = (patch: Partial<PolicyDraft>, clear?: keyof PolicyErrors) => {
    setDraft((current) => ({ ...current, ...patch, preset: "custom" }));
    if (clear) setErrors((current) => ({ ...current, [clear]: undefined }));
  };
  const restrict = (key: keyof PolicyRestrictions, on: boolean, reset?: Partial<PolicyDraft>) =>
    setDraft((current) => ({
      ...current,
      ...(on ? {} : reset),
      preset: "custom",
      restrict: { ...current.restrict, [key]: on }
    }));
  const isEdit = Boolean(policy);
  const onPqcBlocked = () =>
    openUpgradeGate({
      intent: PostQuantumCertificatesUpgradeIntent,
      paywallKey: "cert-manager.policy-algorithm"
    });
  const check = (index: number) => {
    const next = policyStepErrors(draft, index);
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title={isEdit ? "Edit certificate policy" : "Create certificate policy"}
        open
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next) return;
          setStep(step);
          requestDiscard();
        }}
        completeLabel={isEdit ? "Save changes" : "Create policy"}
        onComplete={async () => {
          const rules = policyToApi(draft);
          if (policy) {
            await update
              .mutateAsync({ policyId: policy.id, ...rules })
              .catch(readableFailure("Could not update the certificate policy."));
            saved(`Certificate policy ${rules.name} updated`);
          } else {
            const created = await create
              .mutateAsync({ projectId, ...rules })
              .catch(readableFailure("Could not create the certificate policy."));
            saved(`Certificate policy ${rules.name} created`);
            onCreated?.(created);
          }
          onClose();
        }}
        steps={[
          {
            title: STEP_TITLES[0],
            summary: draft.name || undefined,
            validate: () => check(0),
            content: (
              <BasicsStep
                draft={draft}
                errors={errors}
                setDraft={setDraft}
                setErrors={setErrors}
                isEdit={isEdit}
                defaultName={defaultName}
              />
            )
          },
          {
            title: STEP_TITLES[1],
            description:
              "A restriction left off allows any value. Requests outside the rules are rejected at issuance.",
            validate: () => check(1),
            content: (
              <SubjectStep draft={draft} errors={errors} change={change} restrict={restrict} />
            )
          },
          {
            title: STEP_TITLES[2],
            validate: () => check(2),
            content: (
              <AlgorithmsStep
                draft={draft}
                errors={errors}
                change={change}
                restrict={restrict}
                setErrors={setErrors}
                pqcLocked={!subscription?.pkiPqc}
                onPqcBlocked={onPqcBlocked}
              />
            )
          },
          {
            title: STEP_TITLES[3],
            content: <UsagesStep draft={draft} change={change} restrict={restrict} />
          },
          {
            title: STEP_TITLES[4],
            validate: () => check(4),
            content: (
              <ExtensionsStep
                draft={draft}
                errors={errors}
                change={change}
                restrict={restrict}
                setErrors={setErrors}
              />
            )
          },
          {
            title: STEP_TITLES[5],
            content: <ConstraintsStep draft={draft} change={change} restrict={restrict} />
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your unsaved policy changes will be lost."
      />
      {upgradeGate}
    </>
  );
};
