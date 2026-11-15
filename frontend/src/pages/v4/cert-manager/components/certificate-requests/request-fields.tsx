import type { ReactNode } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field, FieldError, FieldSet } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Grid, Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { SmallText } from "@infisical/cipher/ui/text";

import {
  CertificateIssuanceLimitsUpgradeIntent,
  PostQuantumCertificatesUpgradeIntent
} from "@app/components/license/UpgradeGate/upgrade-intents";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType,
  customExtensionLabelFor,
  formatExtendedKeyUsage,
  formatKeyUsage
} from "@app/helpers/certificateConstants";
import type { PolicyNotice, PolicyRowGuidance } from "@app/helpers/certificatePolicyGuidance";
import { getSanPlaceholder } from "@app/helpers/certificateUtils";
import type { TCustomExtensionRule } from "@app/hooks/api/certificatePolicies/types";
import type { TProfileCustomExtension } from "@app/hooks/api/certificateProfiles/types";
import {
  getCaSignatureIncompatibilityReason,
  isPqcAlgorithm
} from "@app/hooks/api/certificates/constants";
import type { TIssuerModifiedField } from "@app/hooks/api/certificates/types";

import { useOrgId } from "../../../access/permissions";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license/useUpgradeGate";
import {
  extensionPlaceholder,
  isPresetExtension,
  oidOptions,
  ruleKey,
  SAN_LABELS,
  SUBJECT_LABELS
} from "../policy-model";
import type { ExtensionRow, SanRow, SubjectRow } from "./request-model";

const SUBJECT_PLACEHOLDERS: Record<CertSubjectAttributeType, string> = {
  [CertSubjectAttributeType.COMMON_NAME]: "example.com",
  [CertSubjectAttributeType.ORGANIZATION]: "Acme Inc.",
  [CertSubjectAttributeType.ORGANIZATIONAL_UNIT]: "Engineering",
  [CertSubjectAttributeType.COUNTRY]: "US",
  [CertSubjectAttributeType.STATE]: "California",
  [CertSubjectAttributeType.LOCALITY]: "San Francisco",
  [CertSubjectAttributeType.DOMAIN_COMPONENT]: "example"
};

const rowMessage = (lines?: string[]) =>
  lines?.length ? <SmallText muted>{lines.join("; ")}</SmallText> : undefined;

export const PolicyNotices = ({ notices }: { notices: PolicyNotice[] }) =>
  notices.length ? (
    <Stack gap={8}>
      {notices.map((notice) => (
        <FieldError key={notice.key}>
          <Stack gap={2}>
            <span>
              {notice.message}
              {notice.label ? ` ${notice.label}:` : null}
            </span>
            {notice.items?.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </Stack>
        </FieldError>
      ))}
    </Stack>
  ) : null;

const RemoveButton = ({ locked, onRemove }: { locked?: boolean; onRemove: () => void }) => (
  <Button
    variant="ghost"
    icon="trash"
    iconOnly
    disabledReason={locked ? "The certificate policy requires this entry" : undefined}
    onClick={onRemove}
  >
    Remove entry
  </Button>
);

type SectionGuidance = { rows: PolicyRowGuidance[]; notices: PolicyNotice[] };

export const SubjectAttributesField = ({
  rows,
  onChange,
  allowedTypes,
  error,
  rowErrors,
  guidance,
  revealPolicy
}: {
  rows: SubjectRow[];
  onChange: (rows: SubjectRow[]) => void;
  allowedTypes: CertSubjectAttributeType[];
  error?: string;
  rowErrors?: Record<string, string>;
  guidance?: SectionGuidance;
  revealPolicy?: boolean;
}) => {
  const used = new Set(rows.map((row) => row.type));
  const isMulti = (type: CertSubjectAttributeType) =>
    type === CertSubjectAttributeType.DOMAIN_COMPONENT;
  const available = allowedTypes.filter((type) => isMulti(type) || !used.has(type));
  const update = (key: string, patch: Partial<SubjectRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  return (
    <FieldSet
      legend="Subject attributes"
      actions={
        <Button
          variant="outline"
          size="sm"
          icon="plus"
          disabledReason={available.length ? undefined : "Every allowed attribute is in use"}
          onClick={() => onChange([...rows, { key: ruleKey(), type: available[0], value: "" }])}
        >
          Add attribute
        </Button>
      }
    >
      <Stack gap={8}>
        {rows.length === 0 && <SmallText muted>No subject attributes.</SmallText>}
        {rows.map((row, index) => {
          const policy = guidance?.rows[index];
          const rowError = rowErrors?.[row.key] ?? (revealPolicy ? policy?.error : undefined);
          return (
            <Inline key={row.key} gap={8} align="start" wrap={false}>
              <Select
                aria-label="Attribute type"
                width="md"
                disabled={policy?.isLocked}
                options={allowedTypes
                  .filter((type) => type === row.type || isMulti(type) || !used.has(type))
                  .map((type) => ({ value: type, label: SUBJECT_LABELS[type] }))}
                value={row.type}
                onChange={(type) => update(row.key, { type: type as CertSubjectAttributeType })}
              />
              <InlineGrow>
                <Field
                  error={rowError}
                  description={rowError ? undefined : rowMessage(policy?.hint)}
                >
                  <Input
                    aria-label={`${SUBJECT_LABELS[row.type]} value`}
                    placeholder={SUBJECT_PLACEHOLDERS[row.type]}
                    value={row.value}
                    invalid={Boolean(rowError)}
                    autoComplete="off"
                    onChange={(event) => update(row.key, { value: event.target.value })}
                  />
                </Field>
              </InlineGrow>
              <RemoveButton
                locked={policy?.isLocked}
                onRemove={() => onChange(rows.filter((item) => item.key !== row.key))}
              />
            </Inline>
          );
        })}
        {error && <FieldError>{error}</FieldError>}
        {revealPolicy && <PolicyNotices notices={guidance?.notices ?? []} />}
      </Stack>
    </FieldSet>
  );
};

export const SubjectAltNamesField = ({
  rows,
  onChange,
  allowedTypes,
  error,
  rowErrors,
  guidance,
  revealPolicy
}: {
  rows: SanRow[];
  onChange: (rows: SanRow[]) => void;
  allowedTypes: CertSubjectAlternativeNameType[];
  error?: string;
  rowErrors?: Record<string, string>;
  guidance?: SectionGuidance;
  revealPolicy?: boolean;
}) => {
  const { data: subscription } = useV4Adapter("pkiPolicies").useSubscription(useOrgId());
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const maxSans = subscription?.maxSansPerCertificate;
  const isAtLimit = typeof maxSans === "number" && rows.length >= maxSans;
  const noWildcards = subscription?.maxWildcardCertificates === 0;
  const update = (key: string, patch: Partial<SanRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  return (
    <FieldSet
      legend="Subject alternative names"
      actions={
        <Button
          variant="outline"
          size="sm"
          icon="plus"
          onClick={() => {
            if (isAtLimit) {
              openUpgradeGate({
                intent: CertificateIssuanceLimitsUpgradeIntent,
                paywallKey: "cert-manager.certificate-san-limit"
              });
              return;
            }
            onChange([
              ...rows,
              {
                key: ruleKey(),
                type: allowedTypes[0] ?? CertSubjectAlternativeNameType.DNS_NAME,
                value: ""
              }
            ]);
          }}
        >
          Add SAN
        </Button>
      }
    >
      <Stack gap={8}>
        {rows.length === 0 && <SmallText muted>No subject alternative names.</SmallText>}
        {rows.map((row, index) => {
          const policy = guidance?.rows[index];
          const rowError =
            rowErrors?.[row.key] ??
            (noWildcards && row.value.includes("*")
              ? "Wildcard certificates are not available on your plan."
              : undefined) ??
            (revealPolicy ? policy?.error : undefined);
          return (
            <Inline key={row.key} gap={8} align="start" wrap={false}>
              <Select
                aria-label="SAN type"
                width="sm"
                disabled={policy?.isLocked}
                options={[...new Set([row.type, ...allowedTypes])].map((type) => ({
                  value: type,
                  label: SAN_LABELS[type]
                }))}
                value={row.type}
                onChange={(type) =>
                  update(row.key, { type: type as CertSubjectAlternativeNameType })
                }
              />
              <InlineGrow>
                <Field
                  error={rowError}
                  description={rowError ? undefined : rowMessage(policy?.hint)}
                >
                  <Input
                    aria-label={`${SAN_LABELS[row.type]} value`}
                    placeholder={getSanPlaceholder(row.type)}
                    value={row.value}
                    invalid={Boolean(rowError)}
                    autoComplete="off"
                    onChange={(event) => {
                      const next = event.target.value;
                      if (noWildcards && next.includes("*") && !row.value.includes("*")) {
                        openUpgradeGate({
                          intent: CertificateIssuanceLimitsUpgradeIntent,
                          paywallKey: "cert-manager.certificate-wildcards"
                        });
                        return;
                      }
                      update(row.key, { value: next });
                    }}
                  />
                </Field>
              </InlineGrow>
              <RemoveButton
                locked={policy?.isLocked}
                onRemove={() => onChange(rows.filter((item) => item.key !== row.key))}
              />
            </Inline>
          );
        })}
        {isAtLimit && (
          <SmallText muted>
            {`Your plan allows up to ${maxSans} subject alternative names per certificate.`}
          </SmallText>
        )}
        {error && <FieldError>{error}</FieldError>}
        {revealPolicy && <PolicyNotices notices={guidance?.notices ?? []} />}
      </Stack>
      {upgradeGate}
    </FieldSet>
  );
};

export const ValidityField = ({
  value,
  onChange,
  label = "Validity (TTL)",
  description,
  error,
  hint,
  policyError,
  revealPolicy,
  readOnly
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  description?: ReactNode;
  error?: string;
  hint?: string[];
  policyError?: string;
  revealPolicy?: boolean;
  readOnly?: boolean;
}) => {
  const shown = error ?? (revealPolicy ? policyError : undefined);
  return (
    <Field
      label={label}
      error={shown}
      description={
        shown ? undefined : [description, hint?.join("; ")].filter(Boolean).join(" ") || undefined
      }
    >
      <Input
        width="sm"
        placeholder="30d, 1y, 8760h"
        value={value}
        readOnly={readOnly}
        invalid={Boolean(shown)}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
};

type AlgorithmOption = { value: string; label: string };

const AlgorithmSelect = ({
  label,
  options,
  value,
  onChange,
  error,
  placeholder,
  disabledReason,
  caKeyAlgorithm,
  hasPqc
}: {
  label: string;
  options: AlgorithmOption[];
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder: string;
  disabledReason?: string;
  caKeyAlgorithm?: string | null;
  hasPqc: boolean;
}) => {
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  return (
    <Field label={label} error={error} description={disabledReason}>
      <Select
        aria-label={label}
        placeholder={options.length ? placeholder : "No algorithms available"}
        disabled={Boolean(disabledReason)}
        invalid={Boolean(error)}
        options={options.map((option) => {
          const gated = isPqcAlgorithm(option.value) && !hasPqc;
          const reason = gated
            ? undefined
            : getCaSignatureIncompatibilityReason(option.value, caKeyAlgorithm);
          return {
            value: option.value,
            label: option.label,
            disabled: Boolean(reason),
            description: gated ? "Enterprise" : reason
          };
        })}
        value={value || undefined}
        onChange={(next) => {
          if (isPqcAlgorithm(next) && !hasPqc) {
            openUpgradeGate({
              intent: PostQuantumCertificatesUpgradeIntent,
              paywallKey: "cert-manager.certificate-algorithm"
            });
            return;
          }
          onChange(next);
        }}
      />
      {upgradeGate}
    </Field>
  );
};

export const AlgorithmSelectors = ({
  signatureOptions,
  keyOptions,
  signatureAlgorithm,
  keyAlgorithm,
  onChange,
  signatureError,
  keyError,
  hideSignatureAlgorithm,
  keyDisabledReason,
  keyPlaceholder = "Select key algorithm",
  caKeyAlgorithm
}: {
  signatureOptions: AlgorithmOption[];
  keyOptions: AlgorithmOption[];
  signatureAlgorithm?: string;
  keyAlgorithm?: string;
  onChange: (patch: { signatureAlgorithm?: string; keyAlgorithm?: string }) => void;
  signatureError?: string;
  keyError?: string;
  hideSignatureAlgorithm?: boolean;
  keyDisabledReason?: string;
  keyPlaceholder?: string;
  caKeyAlgorithm?: string | null;
}) => {
  const { data: subscription } = useV4Adapter("pkiPolicies").useSubscription(useOrgId());
  const hasPqc = Boolean(subscription?.pkiPqc);
  return (
    <Grid columns={2} gap={16}>
      {!hideSignatureAlgorithm && (
        <AlgorithmSelect
          label="Signature algorithm"
          options={signatureOptions}
          value={signatureAlgorithm}
          onChange={(value) => onChange({ signatureAlgorithm: value })}
          error={signatureError}
          placeholder="Select signature algorithm"
          caKeyAlgorithm={caKeyAlgorithm}
          hasPqc={hasPqc}
        />
      )}
      <AlgorithmSelect
        label="Key algorithm"
        options={keyOptions}
        value={keyAlgorithm}
        onChange={(value) => onChange({ keyAlgorithm: value })}
        error={keyError}
        placeholder={keyPlaceholder}
        disabledReason={keyDisabledReason}
        hasPqc={hasPqc}
      />
    </Grid>
  );
};

export const UsageChecks = ({
  legend,
  options,
  required,
  value,
  onChange
}: {
  legend: string;
  options: { value: string; label: string }[];
  required: string[];
  value: Record<string, boolean | undefined>;
  onChange: (value: Record<string, boolean | undefined>) => void;
}) => {
  if (options.length === 0) return null;
  const requiredSet = new Set(required);
  return (
    <FieldSet legend={legend}>
      <Grid columns={2} gap={12}>
        {options.map((option) => {
          const isRequired = requiredSet.has(option.value);
          return (
            <Checkbox
              key={option.value}
              label={isRequired ? `${option.label} (required)` : option.label}
              checked={isRequired || Boolean(value[option.value])}
              disabled={isRequired}
              onCheckedChange={(checked) =>
                onChange({ ...value, [option.value]: checked === true })
              }
            />
          );
        })}
      </Grid>
    </FieldSet>
  );
};

export const BasicConstraintsField = ({
  isCA,
  pathLength,
  onChange,
  requiresCA,
  maxPathLength
}: {
  isCA: boolean;
  pathLength?: number | null;
  onChange: (value: { isCA: boolean; pathLength?: number | null }) => void;
  requiresCA: boolean;
  maxPathLength?: number;
}) => (
  <FieldSet legend="Basic constraints">
    <Stack gap={12}>
      <Checkbox
        label="Issue as certificate authority"
        description="This certificate will be issued with the CA:TRUE extension."
        checked={requiresCA || isCA}
        disabled={requiresCA}
        onCheckedChange={(checked) =>
          onChange(
            checked === true ? { isCA: true, pathLength } : { isCA: false, pathLength: null }
          )
        }
      />
      {(requiresCA || isCA) && (
        <Field
          label="Path length"
          optional
          description={
            maxPathLength !== undefined
              ? `How many sub-CA levels can exist below this certificate, from 0 to ${maxPathLength}. 0 means it can only sign end-entity certificates.`
              : "How many sub-CA levels can exist below this certificate. Empty means unlimited; 0 means it can only sign end-entity certificates."
          }
        >
          <Input
            type="number"
            min={0}
            max={maxPathLength}
            width="xs"
            placeholder="No constraint"
            value={pathLength ?? ""}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              onChange({ isCA: true, pathLength: Number.isNaN(parsed) ? null : parsed });
            }}
          />
        </Field>
      )}
    </Stack>
  </FieldSet>
);

const criticalityLock = (oid: string, rules?: TCustomExtensionRule[] | null) => {
  if (!oid) return undefined;
  if (isPresetExtension(oid))
    return "Criticality is fixed for this extension because Active Directory rejects certificates that mark it differently.";
  return rules?.find((rule) => rule.oid === oid)?.critical
    ? "The certificate policy pins the criticality for this object identifier."
    : undefined;
};

export const CustomExtensionsField = ({
  rows,
  onChange,
  declarations,
  policyRules,
  errorsByOid,
  revealPolicy
}: {
  rows: ExtensionRow[];
  onChange: (rows: ExtensionRow[]) => void;
  declarations: TProfileCustomExtension[];
  policyRules?: TCustomExtensionRule[] | null;
  errorsByOid?: Record<string, string>;
  revealPolicy?: boolean;
}) => {
  const isUnrestricted = policyRules === undefined || policyRules === null;
  const effective: TProfileCustomExtension[] = [
    ...declarations,
    ...(policyRules ?? [])
      .filter(
        (rule) =>
          rule.required?.length && !declarations.some((declaration) => declaration.oid === rule.oid)
      )
      .map((rule) => ({ oid: rule.oid, label: rule.label ?? undefined }))
  ];
  const isPinned = (declaration: TProfileCustomExtension) =>
    Boolean(declaration.value?.trim()) ||
    Boolean(policyRules?.find((rule) => rule.oid === declaration.oid)?.required?.length);
  const pinned = effective.filter(isPinned);
  const pinnedOids = new Set(pinned.map((declaration) => declaration.oid));
  const declarationByOid = new Map(effective.map((declaration) => [declaration.oid, declaration]));
  const added = rows.filter((row) => !pinnedOids.has(row.oid));
  const used = new Set([...pinnedOids, ...added.map((row) => row.oid)]);
  const offerable = (policyRules?.map((rule) => rule.oid) ?? [...declarationByOid.keys()]).filter(
    (oid) => !used.has(oid)
  );
  const labelOf = (oid: string) =>
    customExtensionLabelFor(
      oid,
      declarationByOid.get(oid)?.label ?? policyRules?.find((rule) => rule.oid === oid)?.label
    );
  const errorOf = (oid: string) => (revealPolicy ? errorsByOid?.[oid] : undefined);
  const upsertPinned = (oid: string, patch: Partial<ExtensionRow>) => {
    const existing = rows.find((row) => row.oid === oid);
    onChange(
      existing
        ? rows.map((row) => (row.oid === oid ? { ...row, ...patch } : row))
        : [...rows, { key: ruleKey(), oid, value: "", ...patch }]
    );
  };
  const update = (key: string, patch: Partial<ExtensionRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const critical = (oid: string, checked: boolean, onToggle: (next: boolean) => void) => {
    const lock = criticalityLock(oid, policyRules);
    return (
      <Checkbox
        label="Critical"
        checked={checked}
        disabled={Boolean(lock)}
        title={lock}
        onCheckedChange={(next) => onToggle(next === true)}
      />
    );
  };
  return (
    <FieldSet
      legend="Custom extensions"
      actions={
        <Button
          variant="outline"
          size="sm"
          icon="plus"
          onClick={() => onChange([...rows, { key: ruleKey(), oid: "", value: "" }])}
        >
          Add extension
        </Button>
      }
    >
      <Stack gap={8}>
        {pinned.length === 0 && added.length === 0 && (
          <SmallText muted>No custom extensions.</SmallText>
        )}
        {pinned.map((declaration) => {
          const current = rows.find((row) => row.oid === declaration.oid);
          const error = errorOf(declaration.oid);
          return (
            <Inline key={declaration.oid} gap={8} align="start" wrap={false}>
              <Input
                aria-label="Extension"
                width="md"
                mono
                value={labelOf(declaration.oid)}
                disabled
              />
              <InlineGrow>
                <Field error={error}>
                  <Input
                    aria-label="Extension value"
                    placeholder={extensionPlaceholder(declaration.oid)}
                    value={current?.value ?? declaration.value ?? ""}
                    invalid={Boolean(error)}
                    autoComplete="off"
                    onChange={(event) =>
                      upsertPinned(declaration.oid, { value: event.target.value })
                    }
                  />
                </Field>
              </InlineGrow>
              {critical(declaration.oid, Boolean(current?.critical), (next) =>
                upsertPinned(declaration.oid, { critical: next })
              )}
            </Inline>
          );
        })}
        {added.map((row) => {
          const error = errorOf(row.oid);
          const selectOid = (oid: string) =>
            update(row.key, { oid, value: row.value || (declarationByOid.get(oid)?.value ?? "") });
          return (
            <Inline key={row.key} gap={8} align="start" wrap={false}>
              {isUnrestricted ? (
                <Combobox
                  label="Extension"
                  placeholder="Select or enter an OID"
                  width="md"
                  mono
                  options={oidOptions([row.oid, ...offerable].filter(Boolean)).filter(
                    (option) => option.value === row.oid || !used.has(option.value)
                  )}
                  value={row.oid}
                  onChange={selectOid}
                  onCreate={(oid) => selectOid(oid.trim())}
                  createLabel={(query) => `Use ${query}`}
                />
              ) : (
                <Select
                  aria-label="Extension"
                  width="md"
                  placeholder="Select an extension"
                  options={(row.oid ? [row.oid, ...offerable] : offerable).map((oid) => ({
                    value: oid,
                    label: labelOf(oid)
                  }))}
                  value={row.oid || undefined}
                  onChange={selectOid}
                />
              )}
              <InlineGrow>
                <Field error={error}>
                  <Input
                    aria-label="Extension value"
                    placeholder={extensionPlaceholder(row.oid)}
                    value={row.value}
                    invalid={Boolean(error)}
                    autoComplete="off"
                    onChange={(event) => update(row.key, { value: event.target.value })}
                  />
                </Field>
              </InlineGrow>
              {critical(row.oid, Boolean(row.critical), (next) =>
                update(row.key, { critical: next })
              )}
              <RemoveButton
                onRemove={() => onChange(rows.filter((item) => item.key !== row.key))}
              />
            </Inline>
          );
        })}
      </Stack>
    </FieldSet>
  );
};

const ISSUER_MODIFIED_LABELS: Record<string, string> = {
  commonName: "Common name",
  organization: "Organization",
  organizationalUnit: "Organizational unit",
  country: "Country",
  state: "State",
  locality: "Locality",
  domainComponents: "Domain components",
  altNames: "Subject alternative names",
  keyUsages: "Key usages",
  extendedKeyUsages: "Extended key usages",
  keyAlgorithm: "Key algorithm",
  signatureAlgorithm: "Signature algorithm",
  customExtensions: "Custom extensions"
};

const ISSUER_FORMATTERS: Record<string, (value: string) => string> = {
  keyUsages: (value) => formatKeyUsage(value as CertKeyUsageType),
  extendedKeyUsages: (value) => formatExtendedKeyUsage(value as CertExtendedKeyUsageType),
  customExtensions: (oid) => customExtensionLabelFor(oid)
};

const LIST_FIELDS = new Set(["altNames", "keyUsages", "extendedKeyUsages", "customExtensions"]);

const splitValues = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const describeIssuerChange = (field: TIssuerModifiedField) => {
  const label = ISSUER_MODIFIED_LABELS[field.field] ?? field.field;
  if (!LIST_FIELDS.has(field.field)) {
    if (!field.issued) return `${label}: removed ${field.requested}`;
    if (!field.requested) return `${label}: ${field.issued}`;
    return `${label}: changed to ${field.issued}`;
  }
  const format = (values: string[]) =>
    values.map(ISSUER_FORMATTERS[field.field] ?? ((value: string) => value)).join(", ");
  const requested = splitValues(field.requested);
  const issued = splitValues(field.issued);
  const requestedSet = new Set(requested);
  const issuedSet = new Set(issued);
  const addedValues = issued.filter((value) => !requestedSet.has(value));
  const removedValues = requested.filter((value) => !issuedSet.has(value));
  if (!removedValues.length && addedValues.length) return `${label}: ${format(addedValues)}`;
  const parts = [
    addedValues.length ? `added ${format(addedValues)}` : "",
    removedValues.length ? `removed ${format(removedValues)}` : ""
  ].filter(Boolean);
  return `${label}: ${parts.length ? parts.join("; ") : `changed ${format(issued)}`}`;
};

export const IssuerModifiedNotice = ({ fields }: { fields: TIssuerModifiedField[] }) =>
  fields.length ? (
    <Alert tone="warn" title="Additional values set by the CA on the current certificate">
      <Stack gap={4}>
        {fields.map((field) => (
          <span key={field.field}>{describeIssuerChange(field)}</span>
        ))}
      </Stack>
    </Alert>
  ) : null;
