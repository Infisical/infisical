import { type ReactNode, useRef, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Field, FieldError, FieldSet } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { MultiStep, type MultiStepStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { SmallText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { useNavigate } from "@tanstack/react-router";

import { buildManagedRequest } from "@app/helpers/buildManagedRequest";
import {
  type CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/helpers/certificateConstants";
import { buildPolicyRules, withRequiredRows } from "@app/helpers/certificatePolicyGuidance";
import { EXTERNAL_CA_TEMPLATE_HINT, isExternalTemplateCa } from "@app/helpers/certificateUtils";
import type { SubjectAltName } from "@app/helpers/certificateUtils";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability, CaType } from "@app/hooks/api/ca/enums";
import type { TCertificatePolicy } from "@app/hooks/api/certificatePolicies/types";
import { EnrollmentType, type TCertificateProfile } from "@app/hooks/api/certificateProfiles/types";
import { getCaSignatureIncompatibilityReason } from "@app/hooks/api/certificates/constants";
import { CertificateRequestStatus } from "@app/hooks/api/certificates/enums";
import type { TUnifiedCertificateIssuanceResponse } from "@app/hooks/api/certificates/types";
import {
  DEFAULT_TEMPLATE_CONSTRAINTS,
  deriveTemplateConstraints,
  type TemplateConstraints,
  useCertificatePolicyOptions
} from "@app/hooks/useCertificatePolicy";

import { useOrgId } from "../../../access/permissions";
import { readableFailure, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { v4Path } from "../../../links";
import { ruleKey } from "../policy-model";
import {
  AlgorithmSelectors,
  BasicConstraintsField,
  CustomExtensionsField,
  SubjectAltNamesField,
  SubjectAttributesField,
  UsageChecks,
  ValidityField
} from "./request-fields";
import {
  type ExtensionRow,
  keyed,
  type PolicyField,
  type RequestErrors,
  type SanRow,
  type SubjectRow,
  usePolicyGuidance
} from "./request-model";

type Method = "managed" | "csr";
type StepKey = "profile" | "csr" | "subject" | "options" | "extensions" | "metadata";

const AWS_PCA_MAX_CA_PATH_LENGTH = 3;

const STEP_COPY: Record<StepKey, { title: string; description: string }> = {
  profile: {
    title: "Profile",
    description: "Choose how to request the certificate and which profile to use."
  },
  csr: {
    title: "Signing request",
    description: "Paste the certificate signing request to submit for signing."
  },
  subject: {
    title: "Subject",
    description: "Set the subject attributes and alternative names for this certificate."
  },
  options: {
    title: "Options",
    description: "Set validity, algorithms, and key usages within the profile's policy."
  },
  extensions: {
    title: "Custom extensions",
    description: "Set the custom extensions this certificate carries."
  },
  metadata: {
    title: "Metadata",
    description: "Attach optional metadata key-value pairs to this certificate."
  }
};

const STEP_FIELDS: Record<StepKey, string[]> = {
  profile: ["profileId"],
  csr: ["csr", "ttl"],
  subject: ["subjectAttributes", "subjectAltNames"],
  options: ["ttl", "signatureAlgorithm", "keyAlgorithm", "pathLength"],
  extensions: ["customExtensions"],
  metadata: ["metadata"]
};

type Draft = {
  method: Method;
  profileId: string;
  csr: string;
  ttl: string;
  subjectAttributes: SubjectRow[];
  subjectAltNames: SanRow[];
  basicConstraints: { isCA: boolean; pathLength?: number | null };
  signatureAlgorithm: string;
  keyAlgorithm: string;
  keyUsages: Record<string, boolean | undefined>;
  extendedKeyUsages: Record<string, boolean | undefined>;
  customExtensions: ExtensionRow[];
  metadata: { id: string; name: string; value: string }[];
};

const emptyDraft = (profileId = ""): Draft => ({
  method: "managed",
  profileId,
  csr: "",
  ttl: "30d",
  subjectAttributes: [],
  subjectAltNames: [],
  basicConstraints: { isCA: false },
  signatureAlgorithm: "",
  keyAlgorithm: "",
  keyUsages: {},
  extendedKeyUsages: {},
  customExtensions: [],
  metadata: []
});

const toCertificateTtl = (ttl: string) => {
  const match = ttl.match(/^(\d+)([dmyh])$/);
  if (!match) return ttl;
  const value = Number(match[1]);
  if (match[2] === "m") return `${value * 30}d`;
  if (match[2] === "y") return `${value * 365}d`;
  return ttl;
};

const ttlMs = (ttl: string) => {
  const match = ttl.match(/^(\d+)([dhmy])$/);
  if (!match) return 0;
  const days = { h: 1 / 24, d: 1, m: 30, y: 365 }[match[2] as "h" | "d" | "m" | "y"];
  return Number(match[1]) * days * 864e5;
};

const SUBJECT_DEFAULT_KEYS: [
  CertSubjectAttributeType,
  keyof NonNullable<TCertificateProfile["defaults"]>
][] = [
  [CertSubjectAttributeType.COMMON_NAME, "commonName"],
  [CertSubjectAttributeType.ORGANIZATION, "organization"],
  [CertSubjectAttributeType.ORGANIZATIONAL_UNIT, "organizationalUnit"],
  [CertSubjectAttributeType.COUNTRY, "country"],
  [CertSubjectAttributeType.STATE, "state"],
  [CertSubjectAttributeType.LOCALITY, "locality"]
];

const seedFromProfile = ({
  draft,
  profile,
  policy,
  constraints,
  signatureOptions,
  keyOptions
}: {
  draft: Draft;
  profile: TCertificateProfile;
  policy?: TCertificatePolicy;
  constraints: TemplateConstraints;
  signatureOptions: { value: string }[];
  keyOptions: { value: string }[];
}): Draft => {
  const defaults = profile.defaults ?? undefined;
  const maxValidity = policy?.validity?.max;
  let { ttl } = draft;
  if (defaults?.ttlDays && maxValidity)
    ttl = toCertificateTtl(
      defaults.ttlDays * 864e5 <= ttlMs(maxValidity) ? `${defaults.ttlDays}d` : maxValidity
    );
  else if (defaults?.ttlDays) ttl = `${defaults.ttlDays}d`;
  else if (maxValidity) ttl = toCertificateTtl(maxValidity);

  const allowedSubjectTypes = new Set(constraints.allowedSubjectAttributeTypes);
  const allowedSanTypes = new Set(constraints.allowedSanTypes);
  const defaultSubject = [
    ...SUBJECT_DEFAULT_KEYS.flatMap(([type, key]) => {
      const value = defaults?.[key];
      return typeof value === "string" && value ? [{ type, value }] : [];
    }),
    ...(defaults?.domainComponents ?? []).map((value) => ({
      type: CertSubjectAttributeType.DOMAIN_COMPONENT,
      value
    }))
  ].filter((attr) => allowedSubjectTypes.has(attr.type));
  const [firstType] = constraints.allowedSubjectAttributeTypes;
  let subject: { type: CertSubjectAttributeType; value: string }[] = [];
  if (defaultSubject.length) subject = defaultSubject;
  else if (firstType) subject = [{ type: firstType, value: "" }];
  const sans = (defaults?.subjectAltNames ?? []).filter((san): san is SubjectAltName =>
    allowedSanTypes.has(san.type as CertSubjectAlternativeNameType)
  );
  const seeded = withRequiredRows(buildPolicyRules(policy), subject, sans);

  const usages = (base?: string[], required?: string[]) =>
    Object.fromEntries([...(base ?? []), ...(required ?? [])].map((usage) => [usage, true]));
  const caKeyAlgorithm = profile.certificateAuthority?.keyAlgorithm;
  const signatureAlgorithm =
    defaults?.signatureAlgorithm &&
    signatureOptions.some((option) => option.value === defaults.signatureAlgorithm) &&
    !getCaSignatureIncompatibilityReason(defaults.signatureAlgorithm, caKeyAlgorithm)
      ? defaults.signatureAlgorithm
      : "";
  const keyAlgorithm =
    defaults?.keyAlgorithm && keyOptions.some((option) => option.value === defaults.keyAlgorithm)
      ? defaults.keyAlgorithm
      : "";
  return {
    ...draft,
    ttl,
    subjectAttributes: keyed(seeded.subjectAttributes),
    subjectAltNames: keyed(seeded.subjectAltNames),
    basicConstraints: {
      isCA: constraints.templateRequiresCA || Boolean(defaults?.basicConstraints?.isCA),
      pathLength: defaults?.basicConstraints?.pathLength ?? null
    },
    signatureAlgorithm,
    keyAlgorithm,
    keyUsages: usages(defaults?.keyUsages, constraints.requiredKeyUsages),
    extendedKeyUsages: usages(defaults?.extendedKeyUsages, constraints.requiredExtendedKeyUsages),
    customExtensions: []
  };
};

export const RequestCertificateSheet = ({
  applicationId,
  applicationName,
  profileId: fixedProfileId,
  onClose
}: {
  applicationId?: string;
  applicationName?: string;
  profileId?: string;
  onClose: () => void;
}) => {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const certificates = useV4Adapter("certificates");
  const issue = certificates.useIssueCertificate();
  const { data: profileData } = certificates.useCertificateProfiles({
    enrollmentType: applicationId ? undefined : EnrollmentType.API,
    includeConfigs: true,
    applicationId
  });
  const { data: appProfiles } = useV4Adapter("pkiApplications").useApplicationProfiles(
    applicationId ?? ""
  );
  const apiEnabled = new Set(
    (appProfiles ?? [])
      .filter((entry) => Boolean(entry.apiConfigId))
      .map((entry) => entry.profileId)
  );
  const profileOptions = (profileData?.certificateProfiles ?? [])
    .map((profile) => ({ profile, isApiEnabled: !applicationId || apiEnabled.has(profile.id) }))
    .sort(
      (a, b) =>
        Number(b.isApiEnabled) - Number(a.isApiEnabled) ||
        a.profile.slug.localeCompare(b.profile.slug)
    );
  const hasDisabledProfiles = profileOptions.some((option) => !option.isApiEnabled);

  const [initial] = useState(() => emptyDraft(fixedProfileId));
  const [draft, setDraft] = useState(initial);
  const [seededFor, setSeededFor] = useState<string>();
  const [errors, setErrors] = useState<RequestErrors>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const completed = useRef(false);

  const profile = profileOptions.find(
    (option) => option.isApiEnabled && option.profile.id === draft.profileId
  )?.profile;
  const { data: policy, isPending: isPolicyPending } = useV4Adapter("pkiPolicies").usePolicy({
    policyId: profile?.certificatePolicyId ?? "",
    applicationId
  });
  const isPolicyLoading = Boolean(profile?.certificatePolicyId) && isPolicyPending;
  const constraints =
    profile && policy ? deriveTemplateConstraints(policy) : DEFAULT_TEMPLATE_CONSTRAINTS;
  const {
    filteredKeyUsages,
    filteredExtendedKeyUsages,
    availableSignatureAlgorithms,
    availableKeyAlgorithms
  } = useCertificatePolicyOptions(constraints);
  const externalType = profile?.certificateAuthority?.externalType as CaType | undefined;
  const isAdcs = isExternalTemplateCa(externalType);
  const isAwsPca = externalType === CaType.AWS_PCA;
  const supportsExtensions = caSupportsCapability(
    externalType ?? CaType.INTERNAL,
    CaCapability.CUSTOM_EXTENSIONS
  );
  const digicertProduct =
    externalType === CaType.DIGICERT ? profile?.certificateAuthority?.productNameId : undefined;
  const declarations = profile?.defaults?.customExtensions ?? [];
  const isManaged = draft.method === "managed";

  const guidance = usePolicyGuidance({
    policy,
    subjectAttributes: draft.subjectAttributes,
    subjectAltNames: draft.subjectAltNames,
    ttl: draft.ttl,
    customExtensions: draft.customExtensions,
    customExtensionDeclarations: declarations,
    isSubjectSectionShown: constraints.shouldShowSubjectSection,
    isSanSectionShown: constraints.shouldShowSanSection,
    isSubjectEvaluated: isManaged,
    isValidityEvaluated: !isAdcs,
    resetKey: draft.profileId
  });

  const patch = (next: Partial<Draft>, touched: PolicyField[] = []) => {
    setDraft((current) => ({ ...current, ...next }));
    setErrors({});
    if (touched.length) {
      guidance.hide(touched);
      setRowErrors({});
    }
  };

  const stepKeys: StepKey[] = isManaged
    ? [
        "profile",
        ...(constraints.shouldShowSubjectSection || constraints.shouldShowSanSection
          ? (["subject"] as const)
          : []),
        "options",
        ...(policy?.customExtensions?.length !== 0 && supportsExtensions
          ? (["extensions"] as const)
          : []),
        "metadata"
      ]
    : ["profile", "csr", "metadata"];

  const validateFields = (fields: string[]) => {
    const next: RequestErrors = {};
    const nextRows: Record<string, string> = {};
    if (fields.includes("profileId") && !draft.profileId) next.profileId = "Profile is required";
    if (fields.includes("csr") && !draft.csr.trim()) next.csr = "CSR is required";
    if (fields.includes("ttl") && !isAdcs && !draft.ttl.trim()) next.ttl = "TTL is required";
    if (fields.includes("signatureAlgorithm") && !isAdcs && !draft.signatureAlgorithm)
      next.signatureAlgorithm = "Signature algorithm is required";
    if (fields.includes("keyAlgorithm") && !draft.keyAlgorithm)
      next.keyAlgorithm = "Key algorithm is required";
    if (fields.includes("pathLength") && isAwsPca && draft.basicConstraints.isCA) {
      const { pathLength } = draft.basicConstraints;
      if (pathLength === undefined || pathLength === null)
        next.pathLength = `AWS Private CA requires a path length between 0 and ${AWS_PCA_MAX_CA_PATH_LENGTH} for CA certificates`;
      else if (pathLength > AWS_PCA_MAX_CA_PATH_LENGTH)
        next.pathLength = `AWS Private CA supports a maximum path length of ${AWS_PCA_MAX_CA_PATH_LENGTH}`;
    }
    if (fields.includes("subjectAttributes"))
      [...draft.subjectAttributes, ...draft.subjectAltNames].forEach((row) => {
        if (!row.value) nextRows[row.key] = "Value is required";
      });
    if (fields.includes("metadata"))
      draft.metadata.forEach((row) => {
        if (!row.name.trim()) nextRows[row.id] = "Key is required";
      });
    setErrors(next);
    setRowErrors(nextRows);
    return !Object.keys(next).length && !Object.keys(nextRows).length;
  };

  const leaveStep = (key: StepKey) => {
    const fields = STEP_FIELDS[key];
    guidance.reveal(fields);
    if (!validateFields(fields)) return false;
    if (key === "profile" && profile && seededFor !== profile.id) {
      setDraft(
        seedFromProfile({
          draft,
          profile,
          policy,
          constraints,
          signatureOptions: availableSignatureAlgorithms,
          keyOptions: availableKeyAlgorithms
        })
      );
      setSeededFor(profile.id);
    }
    return guidance.findBlockedFields(fields).length === 0;
  };

  const handleResponse = (response: TUnifiedCertificateIssuanceResponse) => {
    if ("certificate" in response && response.certificate) {
      saved("Successfully created certificate");
      navigate({
        to: v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId"),
        params: { orgId, certificateId: response.certificate.certificateId },
        search: applicationName ? { fromApplication: applicationName } : {}
      });
    } else if (
      "status" in response &&
      response.status === CertificateRequestStatus.PENDING_APPROVAL
    )
      saved(
        "Certificate request submitted successfully. Approval is required before the certificate can be issued."
      );
    else
      saved(
        `Certificate request submitted successfully. This may take a few minutes to process. Certificate Request ID: ${response.certificateRequestId}`
      );
  };

  const submit = async () => {
    const [blocked] = guidance.findBlockedFields(stepKeys.flatMap((key) => STEP_FIELDS[key]));
    if (blocked) {
      const blockedStep = stepKeys.findIndex((key) => STEP_FIELDS[key].includes(blocked));
      guidance.reveal(blockedStep >= 0 ? STEP_FIELDS[stepKeys[blockedStep]] : [blocked]);
      if (blockedStep >= 0) setStep(blockedStep);
      throw new Error("Resolve the policy violations before requesting this certificate.");
    }
    const metadata = draft.metadata
      .filter((entry) => entry.name.trim())
      .map(({ name, value }) => ({ key: name.trim(), value: value.trim() }));
    const request = isManaged
      ? buildManagedRequest({
          formData: {
            requestMethod: "managed",
            profileId: draft.profileId,
            ttl: draft.ttl,
            subjectAttributes: draft.subjectAttributes,
            subjectAltNames: draft.subjectAltNames,
            basicConstraints: {
              isCA: draft.basicConstraints.isCA,
              pathLength: draft.basicConstraints.pathLength
            },
            signatureAlgorithm: draft.signatureAlgorithm,
            keyAlgorithm: draft.keyAlgorithm,
            keyUsages: draft.keyUsages,
            extendedKeyUsages: draft.extendedKeyUsages,
            customExtensions: draft.customExtensions,
            metadata
          } as Parameters<typeof buildManagedRequest>[0]["formData"],
          applicationId,
          isAdcsProfile: isAdcs,
          constraints,
          defaults: profile?.defaults
        })
      : {
          profileId: draft.profileId,
          ...(applicationId && { applicationId }),
          csr: draft.csr,
          attributes: isAdcs ? {} : { ttl: draft.ttl },
          ...(metadata.length && { metadata })
        };
    const response = await issue
      .mutateAsync(request)
      .catch(readableFailure("Failed to request certificate"));
    completed.current = true;
    handleResponse(response);
  };

  const close = () => {
    completed.current = false;
    onClose();
  };
  const requestClose = () => {
    if (completed.current) close();
    else if (step > 0 || JSON.stringify(draft) !== JSON.stringify(initial)) setDiscarding(true);
    else close();
  };

  const digicertNotice = digicertProduct && (
    <Alert tone="info">
      {`This profile orders through the DigiCert ${digicertProduct} product, which rejects unsupported subject values when the order is placed.`}
    </Alert>
  );
  const validityField = (
    <ValidityField
      label="Time to live (TTL)"
      value={draft.ttl}
      onChange={(ttl) => patch({ ttl }, ["ttl"])}
      error={errors.ttl}
      hint={guidance.ttlHint}
      policyError={guidance.ttlError}
      revealPolicy={guidance.isRevealed("ttl")}
    />
  );

  const profileHint = (() => {
    if (applicationId && profileOptions.length === 0)
      return "No certificate profiles are attached to this application. Add one under this application's Settings tab.";
    if (hasDisabledProfiles)
      return "Profiles without API enrollment configured can't be used here. Configure API enrollment under this application's Settings tab.";
    return undefined;
  })();

  const content: Record<StepKey, ReactNode> = {
    profile: (
      <Stack gap={16}>
        <Field
          label="Request method"
          description="Managed generates and manages the private key for you. CSR lets you provide your own certificate signing request when you need to manage your own private key."
        >
          <Select
            aria-label="Request method"
            width="md"
            options={[
              { value: "managed", label: "Managed" },
              { value: "csr", label: "Certificate signing request (CSR)" }
            ]}
            value={draft.method}
            onChange={(method) => patch({ method: method as Method })}
          />
        </Field>
        {!fixedProfileId && (
          <Field
            label="Certificate profile"
            error={errors.profileId}
            description={[profileHint, isAdcs ? EXTERNAL_CA_TEMPLATE_HINT : undefined]
              .filter(Boolean)
              .join(" ")}
          >
            <Select
              aria-label="Certificate profile"
              width="md"
              placeholder="Select a certificate profile"
              invalid={Boolean(errors.profileId)}
              options={profileOptions.map(({ profile: option, isApiEnabled }) => ({
                value: option.id,
                label: option.slug,
                disabled: !isApiEnabled,
                description: isApiEnabled ? undefined : "API enrollment not configured"
              }))}
              value={draft.profileId || undefined}
              onChange={(profileId) => patch({ profileId, customExtensions: [] })}
            />
          </Field>
        )}
      </Stack>
    ),
    csr: (
      <Stack gap={16}>
        {digicertNotice}
        <Field label="Certificate signing request (CSR)" error={errors.csr}>
          <Textarea
            mono
            rows={13}
            spellCheck={false}
            placeholder={
              "-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----"
            }
            aria-invalid={Boolean(errors.csr)}
            value={draft.csr}
            onChange={(event) => patch({ csr: event.target.value })}
          />
        </Field>
        {!isAdcs && validityField}
      </Stack>
    ),
    subject: (
      <Stack gap={24}>
        {digicertNotice}
        {constraints.shouldShowSubjectSection && (
          <SubjectAttributesField
            rows={draft.subjectAttributes}
            onChange={(subjectAttributes) => patch({ subjectAttributes }, ["subjectAttributes"])}
            allowedTypes={constraints.allowedSubjectAttributeTypes}
            rowErrors={rowErrors}
            guidance={guidance.subject}
            revealPolicy={guidance.isRevealed("subjectAttributes")}
          />
        )}
        {constraints.shouldShowSanSection && (
          <SubjectAltNamesField
            rows={draft.subjectAltNames}
            onChange={(subjectAltNames) => patch({ subjectAltNames }, ["subjectAltNames"])}
            allowedTypes={constraints.allowedSanTypes}
            rowErrors={rowErrors}
            guidance={guidance.sans}
            revealPolicy={guidance.isRevealed("subjectAltNames")}
          />
        )}
      </Stack>
    ),
    options: (
      <Stack gap={24}>
        {isAdcs ? <SmallText muted>{EXTERNAL_CA_TEMPLATE_HINT}</SmallText> : validityField}
        <AlgorithmSelectors
          signatureOptions={availableSignatureAlgorithms}
          keyOptions={availableKeyAlgorithms}
          signatureAlgorithm={draft.signatureAlgorithm}
          keyAlgorithm={draft.keyAlgorithm}
          onChange={(next) => patch(next)}
          signatureError={errors.signatureAlgorithm}
          keyError={errors.keyAlgorithm}
          hideSignatureAlgorithm={isAdcs}
          caKeyAlgorithm={profile?.certificateAuthority?.keyAlgorithm}
        />
        {!isAdcs && (
          <>
            <UsageChecks
              legend="Key usages"
              options={filteredKeyUsages}
              required={constraints.requiredKeyUsages}
              value={draft.keyUsages}
              onChange={(keyUsages) => patch({ keyUsages })}
            />
            <UsageChecks
              legend="Extended key usages"
              options={filteredExtendedKeyUsages}
              required={constraints.requiredExtendedKeyUsages}
              value={draft.extendedKeyUsages}
              onChange={(extendedKeyUsages) => patch({ extendedKeyUsages })}
            />
            {constraints.templateAllowsCA && (
              <Stack gap={8}>
                <BasicConstraintsField
                  isCA={draft.basicConstraints.isCA}
                  pathLength={draft.basicConstraints.pathLength}
                  onChange={(basicConstraints) => patch({ basicConstraints })}
                  requiresCA={constraints.templateRequiresCA}
                  maxPathLength={isAwsPca ? AWS_PCA_MAX_CA_PATH_LENGTH : undefined}
                />
                {errors.pathLength && <FieldError>{errors.pathLength}</FieldError>}
              </Stack>
            )}
          </>
        )}
      </Stack>
    ),
    extensions: (
      <CustomExtensionsField
        rows={draft.customExtensions}
        onChange={(customExtensions) => patch({ customExtensions }, ["customExtensions"])}
        declarations={declarations}
        policyRules={policy?.customExtensions}
        errorsByOid={guidance.customExtensions.errorsByOid}
        revealPolicy={guidance.isRevealed("customExtensions")}
      />
    ),
    metadata: (
      <FieldSet
        legend="Metadata"
        actions={
          <Button
            variant="outline"
            size="sm"
            icon="plus"
            onClick={() =>
              patch({ metadata: [...draft.metadata, { id: ruleKey(), name: "", value: "" }] })
            }
          >
            Add entry
          </Button>
        }
      >
        <Stack gap={8}>
          {draft.metadata.length === 0 && <SmallText muted>No metadata added.</SmallText>}
          {draft.metadata.map((row) => {
            const update = (next: Partial<Draft["metadata"][number]>) =>
              patch({
                metadata: draft.metadata.map((entry) =>
                  entry.id === row.id ? { ...entry, ...next } : entry
                )
              });
            return (
              <Inline key={row.id} gap={8} align="start" wrap={false}>
                <InlineGrow>
                  <Field error={rowErrors[row.id]}>
                    <Input
                      aria-label="Metadata key"
                      placeholder="Key"
                      value={row.name}
                      invalid={Boolean(rowErrors[row.id])}
                      onChange={(event) => update({ name: event.target.value })}
                    />
                  </Field>
                </InlineGrow>
                <InlineGrow>
                  <Input
                    aria-label="Metadata value"
                    placeholder="Value (optional)"
                    value={row.value}
                    onChange={(event) => update({ value: event.target.value })}
                  />
                </InlineGrow>
                <Button
                  variant="ghost"
                  icon="trash"
                  iconOnly
                  onClick={() =>
                    patch({ metadata: draft.metadata.filter((entry) => entry.id !== row.id) })
                  }
                >
                  Remove metadata entry
                </Button>
              </Inline>
            );
          })}
        </Stack>
      </FieldSet>
    )
  };

  const steps: MultiStepStep[] = stepKeys.map((key) => ({
    title: STEP_COPY[key].title,
    description: STEP_COPY[key].description,
    content: content[key],
    disabledReason:
      key === "profile" && draft.profileId && isPolicyLoading
        ? "Loading the profile's policy"
        : undefined,
    validate: () => leaveStep(key)
  }));

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title="Request certificate"
        open
        step={Math.min(step, steps.length - 1)}
        onStepChange={setStep}
        onOpenChange={(next) => !next && requestClose()}
        completeLabel="Request certificate"
        onComplete={submit}
        steps={steps}
      />
      <DiscardChangesAlertDialog
        open={discarding}
        onOpenChange={setDiscarding}
        onDiscard={() => {
          setDiscarding(false);
          close();
        }}
        description="Your certificate request will be lost."
      />
    </>
  );
};
