import { useState } from "react";
import { subject } from "@casl/ability";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field, FieldError, FieldSet } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Grid, Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { Separator } from "@infisical/cipher/ui/separator";
import { SmallText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { isAxiosError } from "axios";

import {
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability, CaType } from "@app/hooks/api/ca/enums";
import type { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";
import type { TCertificatePolicy } from "@app/hooks/api/certificatePolicies/types";
import { IssuerType, type TCertificateProfile } from "@app/hooks/api/certificateProfiles/types";
import {
  EXTENDED_KEY_USAGES_OPTIONS,
  getCaSignatureIncompatibilityReason,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { ApiErrorTypes } from "@app/hooks/api/types";

import { useOrgId, useProjectPermission } from "../../access/permissions";
import { readableFailure, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { orgHref } from "../../links";
import {
  extensionLabel,
  extensionPlaceholder,
  isPresetExtension,
  oidOptions,
  presetCriticality,
  ruleKey,
  SAN_LABELS,
  type SanType,
  SUBJECT_LABELS,
  SUBJECT_PLACEHOLDERS,
  type SubjectType,
  usageLabel,
  validateExtensionValue
} from "./policy-model";
import { CertificatePolicySheet } from "./policy-sheet";
import {
  type DefaultEntry,
  defaultsToApi,
  type ExtensionDefault,
  normalizeSlug,
  type PolicyConstraints,
  policyConstraintsOf,
  PROFILE_SLUG_PATTERN,
  type ProfileDefaultsDraft,
  type ProfileDraft,
  profileDraftOf
} from "./profile-model";

const NO_DEFAULT = "__none__";
const AWS_ACM_PUBLIC_TTL_DAYS = 198;

type ProfileErrors = Partial<
  Record<"slug" | "description" | "caId" | "policyId" | "template" | "ttlDays", string>
>;

const EntryList = <T extends string>({
  legend,
  emptyText,
  addLabel,
  entries,
  types,
  typeLabels,
  placeholder,
  canAdd,
  onAdd,
  onChange
}: {
  legend: string;
  emptyText: string;
  addLabel: string;
  entries: DefaultEntry<T>[];
  types: (entry: DefaultEntry<T>) => T[];
  typeLabels: Record<T, string>;
  placeholder: (type: T) => string;
  canAdd: boolean;
  onAdd: () => void;
  onChange: (entries: DefaultEntry<T>[]) => void;
}) => (
  <FieldSet
    legend={legend}
    actions={
      <Button variant="outline" size="sm" icon="plus" disabled={!canAdd} onClick={onAdd}>
        {addLabel}
      </Button>
    }
  >
    <Stack gap={8}>
      {entries.length === 0 && <SmallText muted>{emptyText}</SmallText>}
      {entries.map((entry) => (
        <Inline key={entry.key} gap={8} align="center" wrap={false}>
          <Select
            aria-label={`${legend} type`}
            width="md"
            options={[...new Set([entry.type, ...types(entry)])].map((type) => ({
              value: type,
              label: typeLabels[type]
            }))}
            value={entry.type}
            onChange={(type) =>
              onChange(
                entries.map((item) =>
                  item.key === entry.key ? { ...item, type: type as T } : item
                )
              )
            }
          />
          <InlineGrow>
            <Input
              aria-label={`${typeLabels[entry.type]} value`}
              placeholder={placeholder(entry.type)}
              value={entry.value}
              autoComplete="off"
              onChange={(event) =>
                onChange(
                  entries.map((item) =>
                    item.key === entry.key ? { ...item, value: event.target.value } : item
                  )
                )
              }
            />
          </InlineGrow>
          <Button
            variant="ghost"
            icon="trash"
            iconOnly
            onClick={() => onChange(entries.filter((item) => item.key !== entry.key))}
          >
            Remove entry
          </Button>
        </Inline>
      ))}
    </Stack>
  </FieldSet>
);

const UsageChecks = ({
  legend,
  options,
  required,
  selected,
  onChange
}: {
  legend: string;
  options: { value: string; label: string }[];
  required: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) => {
  const requiredSet = new Set(required);
  const selectedSet = new Set(selected);
  return (
    <FieldSet legend={legend}>
      <Grid columns={2} gap={12}>
        {options.map((option) => {
          const isRequired = requiredSet.has(option.value);
          return (
            <Checkbox
              key={option.value}
              label={isRequired ? `${option.label} (required)` : option.label}
              checked={isRequired || selectedSet.has(option.value)}
              disabled={isRequired}
              onCheckedChange={(checked) =>
                onChange(
                  checked === true
                    ? [...selected, option.value]
                    : selected.filter((usage) => usage !== option.value)
                )
              }
            />
          );
        })}
      </Grid>
    </FieldSet>
  );
};

const ExtensionDefaults = ({
  allowed,
  extensions,
  onChange
}: {
  allowed: PolicyConstraints["customExtensions"];
  extensions: ExtensionDefault[];
  onChange: (next: ExtensionDefault[]) => void;
}) => {
  const selectable = allowed?.map((rule) => rule.oid) ?? null;
  const pinned = (oid: string) => allowed?.find((rule) => rule.oid === oid)?.critical;
  const declare = (oid: string, key: string = ruleKey()): ExtensionDefault => {
    const criticality = pinned(oid) ?? presetCriticality(oid);
    return { key, oid, critical: criticality === "critical", value: "" };
  };
  const taken = (except: string) =>
    new Set(extensions.filter((entry) => entry.key !== except).map((entry) => entry.oid));
  const allUsed = Boolean(
    selectable?.length && selectable.every((oid) => extensions.some((entry) => entry.oid === oid))
  );
  const update = (key: string, patch: Partial<ExtensionDefault>) =>
    onChange(extensions.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));

  if (allowed && allowed.length === 0)
    return (
      <FieldSet legend="Custom extensions">
        <SmallText muted>The selected policy doesn&apos;t allow any custom extensions.</SmallText>
      </FieldSet>
    );
  return (
    <FieldSet
      legend="Custom extensions"
      actions={
        <Button
          variant="outline"
          size="sm"
          icon="plus"
          disabledReason={allUsed ? "Every extension this policy allows is declared" : undefined}
          onClick={() => {
            const used = new Set(extensions.map((entry) => entry.oid));
            onChange([...extensions, declare(selectable?.find((oid) => !used.has(oid)) ?? "")]);
          }}
        >
          Add extension
        </Button>
      }
    >
      <Stack gap={8}>
        {extensions.length === 0 && <SmallText muted>No custom extensions declared.</SmallText>}
        {extensions.map((entry) => {
          const preset = isPresetExtension(entry.oid);
          const locked = preset || Boolean(pinned(entry.oid));
          let lockReason: string | undefined;
          if (preset)
            lockReason =
              "Active Directory rejects certificates that mark this extension differently.";
          else if (locked)
            lockReason = "The certificate policy pins the criticality for this object identifier.";
          const valueError =
            entry.oid && entry.value ? validateExtensionValue(entry.oid, entry.value) : undefined;
          const others = taken(entry.key);
          return (
            <Stack key={entry.key} gap={4}>
              <Inline gap={8} align="center" wrap={false}>
                {selectable ? (
                  <Select
                    aria-label="Extension"
                    width="md"
                    placeholder="Select an extension"
                    options={selectable
                      .filter((oid) => !others.has(oid))
                      .map((oid) => ({
                        value: oid,
                        label: extensionLabel(oid, allowed?.find((rule) => rule.oid === oid)?.label)
                      }))}
                    value={entry.oid}
                    onChange={(oid) =>
                      onChange(
                        extensions.map((item) =>
                          item.key === entry.key ? declare(oid, item.key) : item
                        )
                      )
                    }
                  />
                ) : (
                  <Combobox
                    label="Extension"
                    placeholder="Select or enter an OID"
                    width="md"
                    mono
                    options={oidOptions([entry.oid]).filter((option) => !others.has(option.value))}
                    value={entry.oid}
                    onChange={(oid) =>
                      onChange(
                        extensions.map((item) =>
                          item.key === entry.key ? declare(oid, item.key) : item
                        )
                      )
                    }
                    onCreate={(oid) =>
                      onChange(
                        extensions.map((item) =>
                          item.key === entry.key ? declare(oid.trim(), item.key) : item
                        )
                      )
                    }
                    createLabel={(query) => `Use ${query}`}
                  />
                )}
                <InlineGrow>
                  <Input
                    aria-label="Extension value"
                    mono
                    placeholder={extensionPlaceholder(entry.oid)}
                    value={entry.value}
                    invalid={Boolean(valueError)}
                    autoComplete="off"
                    onChange={(event) => update(entry.key, { value: event.target.value })}
                  />
                </InlineGrow>
                <Checkbox
                  label="Critical"
                  checked={entry.critical}
                  disabled={locked}
                  title={lockReason}
                  onCheckedChange={(checked) => update(entry.key, { critical: checked === true })}
                />
                <Button
                  variant="ghost"
                  icon="trash"
                  iconOnly
                  onClick={() => onChange(extensions.filter((item) => item.key !== entry.key))}
                >
                  Remove custom extension
                </Button>
              </Inline>
              {valueError && <FieldError>{valueError}</FieldError>}
            </Stack>
          );
        })}
      </Stack>
    </FieldSet>
  );
};

const defaultOptionsOf = (
  constraints: PolicyConstraints | undefined,
  subjectAttributes: ProfileDefaultsDraft["subjectAttributes"]
) => {
  const usedSubjectTypes = new Set(subjectAttributes.map((entry) => entry.type));
  const allowedKeyUsages = new Set(constraints?.keyUsages);
  const allowedExtendedKeyUsages = new Set(constraints?.extendedKeyUsages);
  return {
    usedSubjectTypes,
    availableSubjectTypes: (constraints?.subjectTypes ?? []).filter(
      (type) => type === "domain_component" || !usedSubjectTypes.has(type)
    ),
    keyUsageOptions: KEY_USAGES_OPTIONS.filter(({ value }) => allowedKeyUsages.has(value)).map(
      ({ value }) => ({ value, label: usageLabel(value) })
    ),
    extendedKeyUsageOptions: EXTENDED_KEY_USAGES_OPTIONS.filter(({ value }) =>
      allowedExtendedKeyUsages.has(value)
    ).map(({ value }) => ({ value, label: usageLabel(value) }))
  };
};

const issuerTraitsOf = (draft: ProfileDraft, authorities: TUnifiedCertificateAuthority[]) => {
  const selectedCa =
    draft.issuerType === IssuerType.CA ? authorities.find((ca) => ca.id === draft.caId) : undefined;
  const isAzureAdcs = selectedCa?.type === CaType.AZURE_AD_CS;
  const isAdcs = selectedCa?.type === CaType.ADCS;
  return {
    isAzureAdcs,
    isAdcs,
    externalAdcs: isAzureAdcs || isAdcs,
    isAwsAcmPublic: selectedCa?.type === CaType.AWS_ACM_PUBLIC_CA,
    caKeyAlgorithm:
      selectedCa?.type === CaType.INTERNAL ? selectedCa.configuration.keyAlgorithm : undefined,
    supportsCustomExtensions:
      draft.issuerType === IssuerType.SELF_SIGNED ||
      (selectedCa !== undefined &&
        caSupportsCapability(selectedCa.type, CaCapability.CUSTOM_EXTENSIONS))
  };
};

const IssuerFields = ({
  draft,
  errors,
  set,
  orgId,
  authorities,
  policies,
  canCreatePolicy,
  onCreatePolicy
}: {
  draft: ProfileDraft;
  errors: ProfileErrors;
  set: (patch: Partial<ProfileDraft>, clear?: keyof ProfileErrors) => void;
  orgId: string;
  authorities: TUnifiedCertificateAuthority[];
  policies: TCertificatePolicy[];
  canCreatePolicy: boolean;
  onCreatePolicy: () => void;
}) => {
  const adapter = useV4Adapter("pkiPolicies");
  const { isAzureAdcs, isAdcs, externalAdcs } = issuerTraitsOf(draft, authorities);
  const { data: azureTemplates } = adapter.useAzureAdcsTemplates({
    caId: draft.caId,
    isAzureAdcsCa: isAzureAdcs
  });
  const { data: adcsTemplates } = adapter.useAdcsTemplates({ caId: draft.caId, isAdcsCa: isAdcs });
  const templateOptions = isAzureAdcs
    ? (azureTemplates?.templates ?? []).map((template) => ({
        value: template.id,
        label: template.name
      }))
    : (adcsTemplates?.templates ?? []).map((template) => ({
        value: template.name,
        label: template.name
      }));
  const policyOptions = policies.map((entry) => ({ value: entry.id, label: entry.name }));
  const caOptions = authorities.map((ca) => ({
    value: ca.id,
    label: ca.name,
    group: ca.type === CaType.INTERNAL ? "Internal CAs" : "External CAs"
  }));
  return (
    <Stack gap={16}>
      <Field
        label="Issuer type"
        description="Self-signed certificates have no CA chain, so use them only for testing or one-off identities."
        wide
      >
        <Select
          aria-label="Issuer type"
          options={[
            { value: IssuerType.CA, label: "Certificate authority" },
            { value: IssuerType.SELF_SIGNED, label: "Self-signed" }
          ]}
          value={draft.issuerType}
          onChange={(issuerType) =>
            set(
              issuerType === IssuerType.SELF_SIGNED
                ? { issuerType: IssuerType.SELF_SIGNED, caId: "", template: "" }
                : { issuerType: issuerType as IssuerType },
              "caId"
            )
          }
        />
      </Field>
      {draft.issuerType === IssuerType.CA && (
        <Field
          label="Certificate authority"
          error={errors.caId}
          description={
            caOptions.length === 0 ? (
              <>
                No certificate authorities yet.{" "}
                <a href={orgHref(orgId, "/cert-manager/certificate-authorities")}>
                  Create one in Certificate authorities
                </a>
              </>
            ) : undefined
          }
          wide
        >
          <Combobox
            label="Certificate authority"
            placeholder="Select a certificate authority"
            invalid={Boolean(errors.caId)}
            options={caOptions}
            value={draft.caId}
            onChange={(caId) =>
              set(caId === draft.caId ? { caId } : { caId, template: "" }, "caId")
            }
          />
        </Field>
      )}
      {externalAdcs && (
        <Field label="Windows ADCS template" error={errors.template} wide>
          <Combobox
            label="Windows ADCS template"
            placeholder={`Select an ${isAzureAdcs ? "Azure ADCS" : "ADCS"} certificate template`}
            invalid={Boolean(errors.template)}
            options={
              draft.template && !templateOptions.some((option) => option.value === draft.template)
                ? [...templateOptions, { value: draft.template, label: draft.template }]
                : templateOptions
            }
            value={draft.template}
            onChange={(template) => set({ template }, "template")}
          />
        </Field>
      )}
      <Field
        label="Certificate policy"
        description="The rules every certificate from this profile must satisfy."
        error={errors.policyId}
        wide
      >
        <Inline gap={8} align="center" wrap={false}>
          <InlineGrow>
            <Combobox
              label="Certificate policy"
              placeholder="Select a certificate policy"
              emptyText="No certificate policies"
              invalid={Boolean(errors.policyId)}
              options={policyOptions}
              value={draft.policyId}
              onChange={(policyId) =>
                set(
                  policyId === draft.policyId
                    ? { policyId }
                    : { policyId, defaults: profileDraftOf(undefined).defaults },
                  "policyId"
                )
              }
            />
          </InlineGrow>
          <Button
            variant="outline"
            icon="plus"
            disabledReason={canCreatePolicy ? undefined : "Your role can't create policies"}
            onClick={() => onCreatePolicy()}
          >
            New policy
          </Button>
        </Inline>
      </Field>
    </Stack>
  );
};

const TtlDefault = ({
  externalAdcs,
  isAwsAcmPublic,
  ttlDays,
  error,
  onChange
}: {
  externalAdcs: boolean;
  isAwsAcmPublic: boolean;
  ttlDays: string;
  error?: string;
  onChange: (ttlDays: string) => void;
}) =>
  externalAdcs ? (
    <SmallText muted>
      The external CA&apos;s certificate template controls validity, key usages, extended key
      usages, and basic constraints.
    </SmallText>
  ) : (
    <Field
      label="Time to live in days"
      optional={!isAwsAcmPublic}
      description={
        isAwsAcmPublic
          ? "AWS ACM Public CA issues certificates with a fixed 198-day validity."
          : "Leave empty for no default."
      }
      error={error}
    >
      <Input
        type="number"
        min={1}
        width="xs"
        placeholder="365"
        disabled={isAwsAcmPublic}
        invalid={Boolean(error)}
        value={isAwsAcmPublic ? String(AWS_ACM_PUBLIC_TTL_DAYS) : ttlDays}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );

const AlgorithmDefaults = ({
  externalAdcs,
  constraints,
  caKeyAlgorithm,
  signatureAlgorithm,
  keyAlgorithm,
  setDefaults
}: {
  externalAdcs: boolean;
  constraints?: PolicyConstraints;
  caKeyAlgorithm?: string | null;
  signatureAlgorithm: string;
  keyAlgorithm: string;
  setDefaults: (patch: Partial<ProfileDefaultsDraft>) => void;
}) => (
  <FieldSet legend="Algorithms">
    <Inline gap={12} align="start">
      {!externalAdcs && (
        <Field label="Signature algorithm">
          <Select
            aria-label="Signature algorithm"
            width="md"
            options={[
              { value: NO_DEFAULT, label: "No default" },
              ...(constraints?.signatureAlgorithms ?? []).map((option) => {
                const reason = getCaSignatureIncompatibilityReason(option.value, caKeyAlgorithm);
                return { ...option, disabled: Boolean(reason), description: reason };
              })
            ]}
            value={signatureAlgorithm || NO_DEFAULT}
            onChange={(value) =>
              setDefaults({ signatureAlgorithm: value === NO_DEFAULT ? "" : value })
            }
          />
        </Field>
      )}
      <Field label="Key algorithm">
        <Select
          aria-label="Key algorithm"
          width="md"
          options={[
            { value: NO_DEFAULT, label: "No default" },
            ...(constraints?.keyAlgorithms ?? [])
          ]}
          value={keyAlgorithm || NO_DEFAULT}
          onChange={(value) => setDefaults({ keyAlgorithm: value === NO_DEFAULT ? "" : value })}
        />
      </Field>
    </Inline>
  </FieldSet>
);

const BasicConstraintsDefaults = ({
  isCA,
  pathLength,
  setDefaults
}: {
  isCA: boolean;
  pathLength: string;
  setDefaults: (patch: Partial<ProfileDefaultsDraft>) => void;
}) => (
  <FieldSet legend="Basic constraints">
    <Stack gap={12}>
      <Checkbox
        label="Issue as certificate authority"
        description="Certificates default to the CA:TRUE extension."
        checked={isCA}
        onCheckedChange={(checked) =>
          setDefaults(checked === true ? { isCA: true } : { isCA: false, pathLength: "" })
        }
      />
      {isCA && (
        <Field
          label="Path length"
          optional
          description="How many sub-CA levels can exist below this certificate."
        >
          <Input
            type="number"
            min={0}
            width="xs"
            value={pathLength}
            onChange={(event) => setDefaults({ pathLength: event.target.value })}
          />
        </Field>
      )}
    </Stack>
  </FieldSet>
);

const DefaultsFields = ({
  draft,
  errors,
  setDefaults,
  clearTtlError,
  constraints,
  externalAdcs,
  isAwsAcmPublic,
  caKeyAlgorithm,
  signatureAlgorithm,
  supportsCustomExtensions
}: {
  draft: ProfileDraft;
  errors: ProfileErrors;
  setDefaults: (patch: Partial<ProfileDefaultsDraft>) => void;
  clearTtlError: () => void;
  constraints?: PolicyConstraints;
  externalAdcs: boolean;
  isAwsAcmPublic: boolean;
  caKeyAlgorithm?: string | null;
  signatureAlgorithm: string;
  supportsCustomExtensions: boolean;
}) => {
  const { defaults } = draft;
  const { usedSubjectTypes, availableSubjectTypes, keyUsageOptions, extendedKeyUsageOptions } =
    defaultOptionsOf(constraints, defaults.subjectAttributes);
  return !draft.policyId ? (
    <EmptyState
      size="sm"
      icon="shield"
      title="Select a certificate policy on the Issuer step to configure defaults"
    />
  ) : (
    <Stack gap={24}>
      <TtlDefault
        externalAdcs={externalAdcs}
        isAwsAcmPublic={isAwsAcmPublic}
        ttlDays={defaults.ttlDays}
        error={errors.ttlDays}
        onChange={(ttlDays) => {
          setDefaults({ ttlDays });
          clearTtlError();
        }}
      />
      <Separator />
      <EntryList<SubjectType>
        legend="Subject attributes"
        emptyText="No subject attribute defaults."
        addLabel="Add attribute"
        entries={defaults.subjectAttributes}
        types={(entry) =>
          (constraints?.subjectTypes ?? []).filter(
            (type) =>
              type === entry.type || type === "domain_component" || !usedSubjectTypes.has(type)
          )
        }
        typeLabels={SUBJECT_LABELS}
        placeholder={(type) => SUBJECT_PLACEHOLDERS[type]}
        canAdd={availableSubjectTypes.length > 0}
        onAdd={() =>
          setDefaults({
            subjectAttributes: [
              ...defaults.subjectAttributes,
              { key: ruleKey(), type: availableSubjectTypes[0], value: "" }
            ]
          })
        }
        onChange={(subjectAttributes) => setDefaults({ subjectAttributes })}
      />
      <EntryList<SanType>
        legend="Subject alternative names"
        emptyText="No SAN defaults."
        addLabel="Add SAN"
        entries={defaults.sans}
        types={() => constraints?.sanTypes ?? []}
        typeLabels={SAN_LABELS}
        placeholder={() => "example.com or *.example.com"}
        canAdd={(constraints?.sanTypes.length ?? 0) > 0}
        onAdd={() =>
          setDefaults({
            sans: [
              ...defaults.sans,
              { key: ruleKey(), type: constraints?.sanTypes[0] ?? "dns_name", value: "" }
            ]
          })
        }
        onChange={(sans) => setDefaults({ sans })}
      />
      <Separator />
      <AlgorithmDefaults
        externalAdcs={externalAdcs}
        constraints={constraints}
        caKeyAlgorithm={caKeyAlgorithm}
        signatureAlgorithm={signatureAlgorithm}
        keyAlgorithm={defaults.keyAlgorithm}
        setDefaults={setDefaults}
      />
      {!externalAdcs && keyUsageOptions.length > 0 && (
        <UsageChecks
          legend="Key usages"
          options={keyUsageOptions}
          required={constraints?.requiredKeyUsages ?? []}
          selected={defaults.keyUsages ?? []}
          onChange={(keyUsages) => setDefaults({ keyUsages })}
        />
      )}
      {!externalAdcs && extendedKeyUsageOptions.length > 0 && (
        <UsageChecks
          legend="Extended key usages"
          options={extendedKeyUsageOptions}
          required={constraints?.requiredExtendedKeyUsages ?? []}
          selected={defaults.extendedKeyUsages ?? []}
          onChange={(extendedKeyUsages) => setDefaults({ extendedKeyUsages })}
        />
      )}
      {!externalAdcs && constraints?.allowsCA && (
        <BasicConstraintsDefaults
          isCA={defaults.isCA}
          pathLength={defaults.pathLength}
          setDefaults={setDefaults}
        />
      )}
      {supportsCustomExtensions && (
        <ExtensionDefaults
          allowed={constraints?.customExtensions ?? null}
          extensions={defaults.customExtensions}
          onChange={(customExtensions) => setDefaults({ customExtensions })}
        />
      )}
    </Stack>
  );
};

export const CertificateProfileSheet = ({
  projectId,
  profile,
  mode = "create",
  initialSlug,
  requireAttach,
  onCreated,
  onClose
}: {
  projectId: string;
  profile?: TCertificateProfile;
  mode?: "create" | "edit" | "clone";
  initialSlug?: string;
  requireAttach?: boolean;
  onCreated?: (profile: TCertificateProfile) => void;
  onClose: () => void;
}) => {
  const orgId = useOrgId();
  const adapter = useV4Adapter("pkiPolicies");
  const create = adapter.useCreateProfile();
  const update = adapter.useUpdateProfile();
  const { permission } = useProjectPermission(projectId);
  const { data: authorities = [] } = useV4Adapter("certificates").useCertificateAuthorities();
  const { data: policyList } = adapter.usePolicies({ limit: 100, offset: 0 });
  const isEdit = mode === "edit" && Boolean(profile);
  const [initial] = useState(() =>
    profileDraftOf(profile, { clone: mode === "clone", initialSlug })
  );
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [step, setStep] = useState(0);
  const [creatingPolicy, setCreatingPolicy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });
  const { data: policy } = adapter.usePolicy({ policyId: draft.policyId });
  const constraints =
    policy && policy.id === draft.policyId ? policyConstraintsOf(policy) : undefined;
  const { isAzureAdcs, externalAdcs, isAwsAcmPublic, caKeyAlgorithm, supportsCustomExtensions } =
    issuerTraitsOf(draft, authorities);
  const signatureAlgorithm =
    draft.defaults.signatureAlgorithm &&
    !getCaSignatureIncompatibilityReason(draft.defaults.signatureAlgorithm, caKeyAlgorithm)
      ? draft.defaults.signatureAlgorithm
      : "";
  const canCreatePolicy = permission.can(
    ProjectPermissionCertificatePolicyActions.Create,
    ProjectPermissionSub.CertificatePolicies
  );

  const set = (patch: Partial<ProfileDraft>, clear?: keyof ProfileErrors) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (clear) setErrors((current) => ({ ...current, [clear]: undefined }));
  };
  const setDefaults = (patch: Partial<ProfileDefaultsDraft>) =>
    setDraft((current) => ({ ...current, defaults: { ...current.defaults, ...patch } }));
  const report = (next: ProfileErrors) => {
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };
  const validateDetails = () => {
    const slug = draft.slug.trim();
    let slugError: string | undefined;
    if (!slug) slugError = "Enter a name.";
    else if (slug.length > 255) slugError = "Use 255 characters or fewer.";
    else if (!PROFILE_SLUG_PATTERN.test(slug))
      slugError = "Use only lowercase letters, numbers, and hyphens.";
    else if (
      !isEdit &&
      !permission.can(
        ProjectPermissionCertificateProfileActions.Create,
        subject(ProjectPermissionSub.CertificateProfiles, { slug })
      )
    )
      slugError = "Your role can't create a profile with this name. Choose an allowed name.";
    else if (
      requireAttach &&
      !permission.can(
        ProjectPermissionCertificateProfileActions.ManageApplicationAttachments,
        subject(ProjectPermissionSub.CertificateProfiles, { slug })
      )
    )
      slugError = "Your role can't attach a profile with this name. Choose an allowed name.";
    return report({
      slug: slugError,
      description:
        draft.description.trim().length > 255 ? "Use 255 characters or fewer." : undefined
    });
  };
  const validateIssuer = () =>
    report({
      caId:
        draft.issuerType === IssuerType.CA && !draft.caId
          ? "Select a certificate authority."
          : undefined,
      template:
        externalAdcs && !draft.template.trim()
          ? `Select the ${isAzureAdcs ? "Azure ADCS" : "ADCS"} certificate template.`
          : undefined,
      policyId: draft.policyId ? undefined : "Select a certificate policy."
    });
  const validateDefaults = () => {
    const ttl = draft.defaults.ttlDays.trim();
    return report({
      ttlDays:
        ttl && !isAwsAcmPublic && !(Number.parseInt(ttl, 10) >= 1)
          ? "Enter at least 1 day, or leave it empty."
          : undefined
    });
  };

  const save = async () => {
    const defaults = defaultsToApi(draft.defaults, {
      constraints,
      externalAdcs,
      customExtensions: supportsCustomExtensions,
      fixedTtlDays: isAwsAcmPublic ? AWS_ACM_PUBLIC_TTL_DAYS : undefined,
      signatureAlgorithm
    });
    const externalConfigs = externalAdcs ? { template: draft.template.trim() } : undefined;
    const slug = draft.slug.trim();
    try {
      if (isEdit && profile) {
        await update.mutateAsync({
          profileId: profile.id,
          slug,
          description: draft.description.trim(),
          issuerType: draft.issuerType,
          ...(externalConfigs && { externalConfigs }),
          defaults
        });
        saved(`Certificate profile ${slug} updated`);
      } else {
        const created = await create.mutateAsync({
          slug,
          description: draft.description.trim(),
          issuerType: draft.issuerType,
          caId: draft.issuerType === IssuerType.SELF_SIGNED ? undefined : draft.caId || undefined,
          certificatePolicyId: draft.policyId,
          ...(externalConfigs && { externalConfigs }),
          ...(defaults && { defaults })
        });
        saved(`Certificate profile ${slug} created`);
        onCreated?.(created);
      }
    } catch (error) {
      if (isAxiosError(error) && error.response?.data?.error === ApiErrorTypes.ConflictError) {
        setErrors({ slug: error.response.data?.message ?? "This name is already in use." });
        setStep(0);
        return false;
      }
      readableFailure(`Couldn't ${isEdit ? "update" : "create"} the certificate profile.`)(error);
    }
    onClose();
    return true;
  };

  const detailsStep = {
    title: "Details",
    summary: draft.slug || undefined,
    validate: validateDetails,
    content: (
      <Stack gap={16}>
        <Field
          label="Name"
          description="Lowercase letters, numbers, and hyphens. Spaces become hyphens."
          error={errors.slug}
          wide
        >
          <Input
            value={draft.slug}
            invalid={Boolean(errors.slug)}
            placeholder="tls-server"
            autoComplete="off"
            onChange={(event) => set({ slug: normalizeSlug(event.target.value) }, "slug")}
          />
        </Field>
        <Field label="Description" optional error={errors.description} wide>
          <Textarea
            rows={3}
            value={draft.description}
            placeholder="What this profile issues"
            onChange={(event) => set({ description: event.target.value }, "description")}
          />
        </Field>
      </Stack>
    )
  };

  const issuerStep = {
    title: "Issuer",
    validate: validateIssuer,
    content: (
      <IssuerFields
        draft={draft}
        errors={errors}
        set={set}
        orgId={orgId}
        authorities={authorities}
        policies={policyList?.certificatePolicies ?? []}
        canCreatePolicy={canCreatePolicy}
        onCreatePolicy={() => setCreatingPolicy(true)}
      />
    )
  };

  const defaultsStep = {
    title: "Certificate defaults",
    description: "Applied when a request leaves a value out. A request can override any of them.",
    validate: validateDefaults,
    content: (
      <DefaultsFields
        draft={draft}
        errors={errors}
        setDefaults={setDefaults}
        clearTtlError={() => setErrors((current) => ({ ...current, ttlDays: undefined }))}
        constraints={constraints}
        externalAdcs={externalAdcs}
        isAwsAcmPublic={isAwsAcmPublic}
        caKeyAlgorithm={caKeyAlgorithm}
        signatureAlgorithm={signatureAlgorithm}
        supportsCustomExtensions={supportsCustomExtensions}
      />
    )
  };

  const titles = {
    create: "Create certificate profile",
    edit: "Edit certificate profile",
    clone: "Clone certificate profile"
  };
  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title={titles[isEdit ? "edit" : mode]}
        open
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next) return;
          setStep(step);
          requestDiscard();
        }}
        completeLabel={isEdit ? "Save changes" : "Create profile"}
        onComplete={save}
        steps={isEdit ? [detailsStep, defaultsStep] : [detailsStep, issuerStep, defaultsStep]}
      />
      {creatingPolicy && (
        <CertificatePolicySheet
          projectId={projectId}
          defaultName={draft.slug ? `${draft.slug}-policy` : undefined}
          onCreated={(created) =>
            set({ policyId: created.id, defaults: profileDraftOf(undefined).defaults }, "policyId")
          }
          onClose={() => setCreatingPolicy(false)}
        />
      )}
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your unsaved profile changes will be lost."
      />
    </>
  );
};
