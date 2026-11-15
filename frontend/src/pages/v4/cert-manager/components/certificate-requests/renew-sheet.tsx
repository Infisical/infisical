import { type ReactNode, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { MultiStep, type MultiStepStep } from "@infisical/cipher/ui/multi-step";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { useNavigate } from "@tanstack/react-router";

import type {
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/helpers/certificateConstants";
import { buildPolicyRules, withRequiredRows } from "@app/helpers/certificatePolicyGuidance";
import {
  buildRenewalFormDefaults,
  buildRenewalRequestAttributes,
  capTtlToDays,
  getRemovedCertificateNames,
  getRemovedCertificateNamesFromCsr,
  unionUsageOptions
} from "@app/helpers/certificateRenewalUtils";
import { isExternalTemplateCa } from "@app/helpers/certificateUtils";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability, CaType } from "@app/hooks/api/ca/enums";
import type { TCertificatePolicy } from "@app/hooks/api/certificatePolicies/types";
import {
  IssuerType,
  type TCertificateProfileWithDetails
} from "@app/hooks/api/certificateProfiles/types";
import {
  certKeyAlgorithms,
  EXTENDED_KEY_USAGES_OPTIONS,
  getCaSignatureIncompatibilityReason,
  KEY_USAGES_OPTIONS,
  SIGNATURE_ALGORITHMS_OPTIONS
} from "@app/hooks/api/certificates/constants";
import {
  CertificateIssuerKind,
  CertificateRenewalKeySource,
  CertificateRequestStatus
} from "@app/hooks/api/certificates/enums";
import type { TCertificate, TCertificateRenewalPreview } from "@app/hooks/api/certificates/types";
import {
  DEFAULT_TEMPLATE_CONSTRAINTS,
  deriveTemplateConstraints,
  type TemplateConstraints,
  useCertificatePolicyOptions
} from "@app/hooks/useCertificatePolicy";
import type { RenewalFormData } from "@app/pages/cert-manager/CertificatesPage/components/CertificateRenewalModal";

import { useOrgId } from "../../../access/permissions";
import { failed, readableFailure, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { v4Path } from "../../../links";
import { certificateName } from "../certificate";
import {
  AlgorithmSelectors,
  BasicConstraintsField,
  CustomExtensionsField,
  IssuerModifiedNotice,
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

type StepKey = "setup" | "csr" | "storedCsr" | "subject" | "options" | "extensions";

type StepCopy = { title: string; description: string };

const STEP_COPY: Record<StepKey, StepCopy> = {
  setup: { title: "Renewal setup", description: "Choose how this renewal handles the key pair." },
  csr: {
    title: "Signing request",
    description: "Provide the CSR and set the validity for this renewal."
  },
  storedCsr: { title: "Validity", description: "Set the validity for this renewal." },
  subject: {
    title: "Subject",
    description: "These are copied from the current certificate. Change only what should differ."
  },
  options: {
    title: "Options",
    description: "Set validity, algorithms, and key usages within the profile's policy."
  },
  extensions: {
    title: "Custom extensions",
    description: "These are copied from the current certificate. Change only what should differ."
  }
};

const REPLAYED_COPY: Partial<Record<StepKey, Partial<StepCopy>>> = {
  subject: {
    description: "These are copied from the original request. Change only what should differ."
  },
  extensions: {
    description: "These are copied from the original request. Change only what should differ."
  }
};

const EXTERNAL_TEMPLATE_COPY: Partial<Record<StepKey, Partial<StepCopy>>> = {
  options: { description: "Choose the key algorithm for the renewed certificate." },
  csr: { description: "Provide the CSR for this renewal." }
};

const REISSUE_COPY: Partial<Record<StepKey, Partial<StepCopy>>> = {
  setup: { description: "Choose the DigiCert order and the key pair." },
  csr: { description: "Provide the CSR for this reissue." },
  options: { description: "Set algorithms and key usages within the profile's policy." }
};

const STEP_FIELDS: Record<StepKey, string[]> = {
  setup: ["keySource"],
  csr: ["csr", "ttl"],
  storedCsr: ["ttl"],
  subject: ["subjectAttributes", "subjectAltNames"],
  options: ["ttl", "signatureAlgorithm", "keyAlgorithm", "keyUsages", "extendedKeyUsages"],
  extensions: ["customExtensions"]
};

const SUBJECT_ISSUER_FIELDS = new Set([
  "commonName",
  "organization",
  "organizationalUnit",
  "country",
  "state",
  "locality",
  "domainComponents",
  "altNames"
]);

const REISSUE_MAX_VALIDITY_DAYS = 199;
const REISSUE_VALIDITY_DESCRIPTION = `Same as the current certificate, up to ${REISSUE_MAX_VALIDITY_DAYS} days. DigiCert also caps it at the end of the order.`;

type Draft = {
  keySource: CertificateRenewalKeySource;
  reissue: boolean;
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
};

const initialDraft = (
  cert: TCertificate,
  constraints: TemplateConstraints,
  policy: TCertificatePolicy | undefined,
  preview: TCertificateRenewalPreview | undefined,
  caKeyAlgorithm?: string | null
): Draft => {
  const defaults = buildRenewalFormDefaults(cert, constraints, preview);
  const seeded = withRequiredRows(
    buildPolicyRules(policy),
    defaults.subjectAttributes ?? [],
    defaults.subjectAltNames ?? []
  );
  const signatureAlgorithm = defaults.signatureAlgorithm ?? "";
  return {
    keySource: CertificateRenewalKeySource.New,
    reissue: false,
    csr: "",
    ttl: defaults.ttl,
    subjectAttributes: keyed(seeded.subjectAttributes),
    subjectAltNames: keyed(seeded.subjectAltNames),
    basicConstraints: defaults.basicConstraints ?? { isCA: false },
    signatureAlgorithm: getCaSignatureIncompatibilityReason(signatureAlgorithm, caKeyAlgorithm)
      ? ""
      : signatureAlgorithm,
    keyAlgorithm: defaults.keyAlgorithm ?? "",
    keyUsages: defaults.keyUsages ?? {},
    extendedKeyUsages: defaults.extendedKeyUsages ?? {},
    customExtensions: keyed(
      (defaults.customExtensions ?? []).map((extension) => ({ ...extension }))
    )
  };
};

const keySourceRefusals = ({
  cert,
  profile,
  preview
}: {
  cert: TCertificate;
  profile?: TCertificateProfileWithDetails;
  preview?: TCertificateRenewalPreview;
}) => {
  const isSelfSigned =
    (profile?.issuerType ?? (cert.caId ? IssuerType.CA : IssuerType.SELF_SIGNED)) ===
    IssuerType.SELF_SIGNED;
  const isIssuedByAcm = profile?.certificateAuthority?.externalType === CaType.AWS_ACM_PUBLIC_CA;
  const isKeyless = cert.hasPrivateKey === false;
  const cannotRenewFromCsr =
    cert.canRenewFromCsr === undefined
      ? preview?.hasOriginatingCsr === false
      : !cert.canRenewFromCsr;
  let reuse: string | undefined;
  if (isSelfSigned && isKeyless)
    reuse =
      "Infisical does not hold this certificate's private key, which is what signs a self-signed certificate.";
  else if (isIssuedByAcm)
    reuse =
      "AWS Certificate Manager can't issue from a signing request, so it can't reuse a key pair. Generate a new key pair.";
  else if (!isSelfSigned && isKeyless && cannotRenewFromCsr)
    reuse =
      "Infisical holds neither this certificate's private key nor a signing request it can renew from. Generate a new key pair, or use a CSR generated from the existing key.";
  else if (!isSelfSigned && cert.caType === CertificateIssuerKind.External && !isKeyless)
    reuse =
      "This certificate authority can reuse a key pair only from a signing request, not from a private key Infisical holds. Generate a new key pair, or export the private key and use a CSR generated from it.";
  let csr: string | undefined;
  if (isSelfSigned)
    csr =
      "A self-signed certificate is signed by its own private key, which a signing request does not carry.";
  else if (isIssuedByAcm) csr = "AWS Certificate Manager can't issue from a signing request.";
  return { reuse, csr, isKeyless };
};

const toFormData = (draft: Draft, renewsFromStoredCsr: boolean): RenewalFormData => ({
  ...draft,
  renewsFromStoredCsr
});

const RenewWizard = ({
  cert,
  profile,
  policy,
  preview,
  applicationName,
  canRevoke,
  onClose
}: {
  cert: TCertificate;
  profile?: TCertificateProfileWithDetails;
  policy?: TCertificatePolicy;
  preview?: TCertificateRenewalPreview;
  applicationName?: string;
  canRevoke: boolean;
  onClose: () => void;
}) => {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const renew = useV4Adapter("certificates").useRenewCertificate();
  const constraints = policy ? deriveTemplateConstraints(policy) : DEFAULT_TEMPLATE_CONSTRAINTS;
  const {
    filteredKeyUsages,
    filteredExtendedKeyUsages,
    availableSignatureAlgorithms,
    availableKeyAlgorithms
  } = useCertificatePolicyOptions(constraints);
  const caKeyAlgorithm = profile?.certificateAuthority?.keyAlgorithm;
  const externalType = (profile?.certificateAuthority?.externalType as CaType | undefined) ?? null;
  const isExternalTemplate = isExternalTemplateCa(externalType);
  const supportsExtensions = caSupportsCapability(
    externalType ?? CaType.INTERNAL,
    CaCapability.CUSTOM_EXTENSIONS
  );
  const isReissueAvailable =
    cert.externalMetadata?.type === CaType.DIGICERT &&
    caSupportsCapability(externalType ?? CaType.INTERNAL, CaCapability.REISSUE_CERTIFICATES);
  const hasOriginatingRequest = preview?.hasOriginatingRequest ?? false;
  const issuerModifiedFields = preview?.issuerModifiedFields ?? [];

  const [initial] = useState(() =>
    initialDraft(cert, constraints, policy, preview, caKeyAlgorithm)
  );
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<RequestErrors>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const newOrderTtl = useRef("");
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [isConfirmPending, setIsConfirmPending] = useState(false);
  const completed = useRef(false);

  const refusals = keySourceRefusals({ cert, profile, preview });
  const renewsFromStoredCsr =
    draft.keySource === CertificateRenewalKeySource.Reuse && refusals.isKeyless;
  const isCsr = draft.keySource === CertificateRenewalKeySource.Csr;
  const isReissuing = isReissueAvailable && draft.reissue;
  const showExtensions = policy?.customExtensions?.length !== 0 && supportsExtensions;

  const guidance = usePolicyGuidance({
    policy,
    subjectAttributes: draft.subjectAttributes,
    subjectAltNames: draft.subjectAltNames,
    ttl: draft.ttl,
    customExtensions: draft.customExtensions,
    isSubjectSectionShown: constraints.shouldShowSubjectSection,
    isSanSectionShown: constraints.shouldShowSanSection,
    isSubjectEvaluated: !isCsr && !renewsFromStoredCsr,
    isValidityEvaluated: !isExternalTemplate,
    resetKey: cert.id
  });

  const patch = (next: Partial<Draft>, touched: PolicyField[] = []) => {
    setDraft((current) => ({ ...current, ...next }));
    setErrors((current) => {
      const cleared = { ...current };
      Object.keys(next).forEach((key) => delete cleared[key]);
      return cleared;
    });
    if (touched.length) {
      guidance.hide(touched);
      if (touched.some((field) => field === "subjectAttributes" || field === "subjectAltNames"))
        setRowErrors({});
    }
  };

  const removedNames = (() => {
    if (!isReissuing) return [];
    if (isCsr) return getRemovedCertificateNamesFromCsr({ certificate: cert, csr: draft.csr });
    return getRemovedCertificateNames({
      certificate: cert,
      formData: {
        subjectAttributes: draft.subjectAttributes,
        subjectAltNames: draft.subjectAltNames
      },
      constraints
    });
  })();
  const nameRemovalError =
    removedNames.length && !canRevoke
      ? "Removing or changing a name on a reissue revokes the current certificate, and you don't have permission to revoke it."
      : undefined;

  const stepKeys = ((): StepKey[] => {
    if (isCsr) return showExtensions ? ["setup", "csr", "extensions"] : ["setup", "csr"];
    if (renewsFromStoredCsr)
      return [
        "setup",
        ...(isExternalTemplate ? [] : (["storedCsr"] as const)),
        ...(showExtensions ? (["extensions"] as const) : [])
      ];
    return [
      "setup",
      ...(constraints.shouldShowSubjectSection || constraints.shouldShowSanSection
        ? (["subject"] as const)
        : []),
      "options",
      ...(showExtensions ? (["extensions"] as const) : [])
    ];
  })();

  const copyOf = (key: StepKey): StepCopy => {
    const base = { ...STEP_COPY[key], ...(isExternalTemplate ? EXTERNAL_TEMPLATE_COPY[key] : {}) };
    const replayed = hasOriginatingRequest ? { ...base, ...REPLAYED_COPY[key] } : base;
    const showsReissue = key === "setup" ? isReissueAvailable : isReissuing;
    return showsReissue ? { ...replayed, ...REISSUE_COPY[key] } : replayed;
  };

  const validateFields = (fields: string[]) => {
    const next: RequestErrors = {};
    const nextRows: Record<string, string> = {};
    if (fields.includes("csr") && isCsr && !draft.csr.trim())
      next.csr = "A certificate signing request is required";
    if (fields.includes("ttl") && !isExternalTemplate && !draft.ttl.trim())
      next.ttl = "TTL is required";
    if (!isExternalTemplate && !isCsr && !renewsFromStoredCsr) {
      if (fields.includes("signatureAlgorithm") && !draft.signatureAlgorithm)
        next.signatureAlgorithm = "Signature algorithm is required";
      if (
        fields.includes("keyAlgorithm") &&
        draft.keySource === CertificateRenewalKeySource.New &&
        !draft.keyAlgorithm
      )
        next.keyAlgorithm = "Key algorithm is required";
    }
    if (fields.includes("subjectAttributes"))
      [...draft.subjectAttributes, ...draft.subjectAltNames].forEach((row) => {
        if (!row.value.trim()) nextRows[row.key] = "Value is required";
      });
    setErrors(next);
    setRowErrors(nextRows);
    return Object.keys(next).length === 0 && Object.keys(nextRows).length === 0;
  };

  const leaveStep = (key: StepKey) => {
    const fields = STEP_FIELDS[key];
    guidance.reveal(fields);
    if (nameRemovalError && (fields.includes("subjectAltNames") || fields.includes("csr")))
      return false;
    if (!validateFields(fields)) return false;
    return guidance.findBlockedFields(fields).length === 0;
  };

  const submit = async () => {
    const attributes = buildRenewalRequestAttributes({
      formData: toFormData(draft, renewsFromStoredCsr),
      constraints,
      isExternalTemplateProfile: isExternalTemplate
    });
    const result = await renew
      .mutateAsync({
        certificateId: cert.id,
        renewalKeySource: draft.keySource,
        ...(isCsr && { csr: draft.csr }),
        ...(isReissuing && { externalConfiguration: { reissue: true } }),
        attributes: isReissuing ? { ...attributes, ttl: undefined } : attributes
      })
      .catch(readableFailure("Failed to renew certificate"));
    if (result.status === CertificateRequestStatus.PENDING_APPROVAL)
      saved(
        "Certificate renewal submitted successfully. Approval is required before the certificate can be issued."
      );
    else if (isReissuing)
      saved(
        `Certificate reissue submitted. This may take a few minutes to process. Certificate Request ID: ${result.certificateRequestId}`
      );
    else if (result.certificate) saved("Certificate renewed successfully");
    else
      saved(
        `Certificate renewal submitted. This may take a few minutes to process. Certificate Request ID: ${result.certificateRequestId}`
      );
    completed.current = true;
    if (result.certificateId && result.certificate)
      navigate({
        to: v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId"),
        params: { orgId, certificateId: result.certificateId },
        search: applicationName ? { fromApplication: applicationName } : {}
      });
  };

  const validateLast = (key: StepKey) => {
    if (!leaveStep(key)) return false;
    const allFields = stepKeys.flatMap((stepKey) => STEP_FIELDS[stepKey]);
    const [blocked] = guidance.findBlockedFields(allFields);
    if (blocked) {
      const blockedStep = stepKeys.findIndex((stepKey) => STEP_FIELDS[stepKey].includes(blocked));
      guidance.reveal(blockedStep >= 0 ? STEP_FIELDS[stepKeys[blockedStep]] : [blocked]);
      if (blockedStep >= 0) setStep(blockedStep);
      failed("Resolve the policy violations before renewing this certificate.");
      return false;
    }
    if (nameRemovalError) {
      const namesStep = stepKeys.indexOf(isCsr ? "csr" : "subject");
      if (namesStep >= 0) setStep(namesStep);
      failed(nameRemovalError);
      return false;
    }
    if (removedNames.length) {
      setConfirmingRemoval(true);
      return false;
    }
    return true;
  };

  const close = () => {
    completed.current = false;
    onClose();
  };

  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: step > 0 || JSON.stringify(draft) !== JSON.stringify(initial),
    onDiscard: close
  });
  const requestClose = () => (completed.current ? close() : requestDiscard());

  const validityField = (description?: string) => (
    <ValidityField
      value={draft.ttl}
      onChange={(ttl) => patch({ ttl }, ["ttl"])}
      readOnly={isReissuing}
      description={isReissuing ? REISSUE_VALIDITY_DESCRIPTION : description}
      error={errors.ttl}
      hint={guidance.ttlHint}
      policyError={guidance.ttlError}
      revealPolicy={guidance.isRevealed("ttl")}
    />
  );

  const subjectChanges = issuerModifiedFields.filter((entry) =>
    SUBJECT_ISSUER_FIELDS.has(entry.field)
  );
  const extensionChanges = issuerModifiedFields.filter(
    (entry) => entry.field === "customExtensions"
  );
  const optionChanges = issuerModifiedFields.filter((entry) => {
    if (SUBJECT_ISSUER_FIELDS.has(entry.field)) return false;
    if (entry.field === "customExtensions") return !showExtensions;
    return entry.field === "keyAlgorithm" || !isExternalTemplate;
  });

  const removalWarning = removedNames.length > 0 && !nameRemovalError && (
    <Alert tone="warn" title="DigiCert will revoke the current certificate">
      {`This reissue removes ${removedNames.join(", ")}. Once the new certificate is issued, DigiCert revokes the current certificate and any earlier reissues and duplicates on this order within 72 hours.`}
    </Alert>
  );

  const keySourceOptions = [
    {
      value: CertificateRenewalKeySource.Reuse,
      title: "Reuse the existing key pair",
      description: cert.hasPrivateKey
        ? "Keep the same private and public key."
        : "Renew from the signing request Infisical holds for this key. Its names stay the same; only validity and extensions can change.",
      refusal: refusals.reuse
    },
    {
      value: CertificateRenewalKeySource.New,
      title: "Generate a new key pair",
      description: "Issue the certificate with a brand new key."
    },
    {
      value: CertificateRenewalKeySource.Csr,
      title: "Use a CSR",
      description: "Provide a certificate signing request with its own key.",
      refusal: refusals.csr
    }
  ];

  const content: Record<StepKey, ReactNode> = {
    setup: (
      <Stack gap={24}>
        {isReissueAvailable && (
          <Field label="DigiCert order" group>
            <RadioGroup
              value={draft.reissue ? "reissue" : "new-order"}
              onValueChange={(choice) => {
                const reissue = choice === "reissue";
                if (reissue === draft.reissue) return;
                if (reissue) {
                  newOrderTtl.current = draft.ttl;
                  patch({ reissue, ttl: capTtlToDays(initial.ttl, REISSUE_MAX_VALIDITY_DAYS) });
                } else patch({ reissue, ttl: newOrderTtl.current || initial.ttl });
              }}
            >
              <RadioGroupCard
                value="new-order"
                title="Place a new order"
                description="Issues the certificate on a new DigiCert order."
              />
              <RadioGroupCard
                value="reissue"
                title="Reissue the existing order"
                description="Issues the certificate on the same DigiCert order, so it can't outlast the order. For longer coverage, place a new order. Removing or changing a name revokes the current certificate and any earlier copies on the order within 72 hours."
              />
            </RadioGroup>
          </Field>
        )}
        <Field label="Key pair" group>
          <RadioGroup
            value={draft.keySource}
            onValueChange={(keySource) =>
              patch({ keySource: keySource as CertificateRenewalKeySource })
            }
          >
            {keySourceOptions.map((option) => (
              <RadioGroupCard
                key={option.value}
                value={option.value}
                title={option.title}
                description={option.refusal ?? option.description}
                disabled={Boolean(option.refusal)}
              />
            ))}
          </RadioGroup>
        </Field>
      </Stack>
    ),
    csr: (
      <Stack gap={16}>
        <Field
          label="Certificate signing request"
          error={errors.csr ?? nameRemovalError}
          description="The subject, key, and extensions are taken from this CSR."
        >
          <Textarea
            mono
            rows={12}
            spellCheck={false}
            placeholder="-----BEGIN CERTIFICATE REQUEST-----"
            value={draft.csr}
            aria-invalid={Boolean(errors.csr ?? nameRemovalError)}
            onChange={(event) => patch({ csr: event.target.value })}
          />
        </Field>
        {removalWarning}
        {!isExternalTemplate && validityField()}
      </Stack>
    ),
    storedCsr: validityField(),
    subject: (
      <Stack gap={24}>
        {constraints.shouldShowSubjectSection && (
          <SubjectAttributesField
            rows={draft.subjectAttributes}
            onChange={(subjectAttributes) => patch({ subjectAttributes }, ["subjectAttributes"])}
            allowedTypes={[
              ...new Set<CertSubjectAttributeType>([
                ...constraints.allowedSubjectAttributeTypes,
                ...draft.subjectAttributes.map((row) => row.type)
              ])
            ]}
            error={constraints.shouldShowSanSection ? undefined : nameRemovalError}
            rowErrors={rowErrors}
            guidance={guidance.subject}
            revealPolicy={guidance.isRevealed("subjectAttributes")}
          />
        )}
        {constraints.shouldShowSanSection && (
          <SubjectAltNamesField
            rows={draft.subjectAltNames}
            onChange={(subjectAltNames) => patch({ subjectAltNames }, ["subjectAltNames"])}
            allowedTypes={[
              ...new Set<CertSubjectAlternativeNameType>([
                ...constraints.allowedSanTypes,
                ...draft.subjectAltNames.map((row) => row.type)
              ])
            ]}
            error={nameRemovalError}
            rowErrors={rowErrors}
            guidance={guidance.sans}
            revealPolicy={guidance.isRevealed("subjectAltNames")}
          />
        )}
        {removalWarning}
        <IssuerModifiedNotice fields={subjectChanges} />
      </Stack>
    ),
    options: (
      <Stack gap={24}>
        {!isExternalTemplate &&
          validityField("The renewed certificate is valid for this long, starting now.")}
        <AlgorithmSelectors
          signatureOptions={unionUsageOptions(
            availableSignatureAlgorithms,
            SIGNATURE_ALGORITHMS_OPTIONS,
            draft.signatureAlgorithm
          )}
          keyOptions={unionUsageOptions(
            availableKeyAlgorithms,
            certKeyAlgorithms,
            draft.keyAlgorithm
          )}
          signatureAlgorithm={draft.signatureAlgorithm}
          keyAlgorithm={draft.keyAlgorithm}
          onChange={(next) => patch(next)}
          signatureError={errors.signatureAlgorithm}
          keyError={errors.keyAlgorithm}
          hideSignatureAlgorithm={isExternalTemplate}
          caKeyAlgorithm={caKeyAlgorithm}
          keyDisabledReason={
            draft.keySource === CertificateRenewalKeySource.Reuse
              ? "The key algorithm is fixed while the existing key pair is reused."
              : undefined
          }
          keyPlaceholder={
            draft.keySource === CertificateRenewalKeySource.Reuse
              ? "Unchanged (existing key pair)"
              : "Select key algorithm"
          }
        />
        {!isExternalTemplate && (
          <>
            <UsageChecks
              legend="Key usages"
              options={unionUsageOptions(
                filteredKeyUsages,
                KEY_USAGES_OPTIONS,
                Object.keys(draft.keyUsages).sort().join(",")
              )}
              required={constraints.requiredKeyUsages}
              value={draft.keyUsages}
              onChange={(keyUsages) => patch({ keyUsages })}
            />
            <UsageChecks
              legend="Extended key usages"
              options={unionUsageOptions(
                filteredExtendedKeyUsages,
                EXTENDED_KEY_USAGES_OPTIONS,
                Object.keys(draft.extendedKeyUsages).sort().join(",")
              )}
              required={constraints.requiredExtendedKeyUsages}
              value={draft.extendedKeyUsages}
              onChange={(extendedKeyUsages) => patch({ extendedKeyUsages })}
            />
            {constraints.templateAllowsCA && (
              <BasicConstraintsField
                isCA={draft.basicConstraints.isCA}
                pathLength={draft.basicConstraints.pathLength}
                onChange={(basicConstraints) => patch({ basicConstraints })}
                requiresCA={constraints.templateRequiresCA}
                maxPathLength={
                  constraints.maxPathLength === -1 ? undefined : constraints.maxPathLength
                }
              />
            )}
          </>
        )}
        <IssuerModifiedNotice fields={optionChanges} />
      </Stack>
    ),
    extensions: (
      <Stack gap={16}>
        <CustomExtensionsField
          rows={draft.customExtensions}
          onChange={(customExtensions) => patch({ customExtensions }, ["customExtensions"])}
          declarations={[]}
          policyRules={policy?.customExtensions}
          errorsByOid={guidance.customExtensions.errorsByOid}
          revealPolicy={guidance.isRevealed("customExtensions")}
        />
        <IssuerModifiedNotice fields={extensionChanges} />
      </Stack>
    )
  };

  const steps: MultiStepStep[] = stepKeys.map((key, index) => {
    const copy = copyOf(key);
    const isLast = index === stepKeys.length - 1;
    return {
      title: copy.title,
      description: copy.description,
      content: content[key],
      validate: () => (isLast ? validateLast(key) : leaveStep(key))
    };
  });

  const label = isReissuing ? "Reissue certificate" : "Renew certificate";

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title={label}
        description={certificateName(cert)}
        open
        step={Math.min(step, steps.length - 1)}
        onStepChange={setStep}
        onOpenChange={(next) => !next && requestClose()}
        completeLabel={label}
        onComplete={submit}
        steps={steps}
      />
      <AlertDialog
        open={confirmingRemoval}
        onOpenChange={(open) => !open && !isConfirmPending && setConfirmingRemoval(false)}
      >
        <AlertDialogContent tone="danger" pending={isConfirmPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Reissue without ${removedNames.join(", ")}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Once the new certificate is issued, DigiCert revokes the current certificate and any
              earlier reissues and duplicates on this order within 72 hours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={isConfirmPending}
              onClick={async () => {
                setIsConfirmPending(true);
                try {
                  await submit();
                  setConfirmingRemoval(false);
                  close();
                } catch (error) {
                  failed("Failed to reissue certificate", error);
                } finally {
                  setIsConfirmPending(false);
                }
              }}
            >
              Reissue certificate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your renewal settings will be lost."
      />
    </>
  );
};

export const RenewCertificateSheet = ({
  cert,
  applicationName,
  canRevoke,
  onClose
}: {
  cert: TCertificate;
  applicationName?: string;
  canRevoke: boolean;
  onClose: () => void;
}) => {
  const { data: preview, isPending: isPreviewPending } = useV4Adapter(
    "certificates"
  ).useRenewalPreview(cert.id);
  const pkiPolicies = useV4Adapter("pkiPolicies");
  const { data: profile } = pkiPolicies.useProfile({ profileId: cert.profileId ?? "" });
  const { data: policy } = pkiPolicies.usePolicy({
    policyId: profile?.certificatePolicyId ?? "",
    applicationId: cert.applicationId ?? undefined
  });
  const isPolicyResolved = Boolean(policy) || (Boolean(profile) && !profile?.certificatePolicyId);
  if (!isPolicyResolved || isPreviewPending)
    return (
      <MultiStep
        variant="sheet"
        size="lg"
        title="Renew certificate"
        description={certificateName(cert)}
        open
        onOpenChange={(next) => !next && onClose()}
        steps={[
          {
            title: "Renewal setup",
            content: <Loader label="Loading renewal settings" />,
            disabledReason: "Loading renewal settings"
          }
        ]}
      />
    );
  return (
    <RenewWizard
      cert={cert}
      profile={profile}
      policy={policy}
      preview={preview}
      applicationName={applicationName}
      canRevoke={canRevoke}
      onClose={onClose}
    />
  );
};
