import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { RefreshCw, TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  RadioGroup,
  RadioGroupItem,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useRenewCertificate } from "@app/hooks/api";
import { CaType } from "@app/hooks/api/ca";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability } from "@app/hooks/api/ca/enums";
import { useGetCertificatePolicyById } from "@app/hooks/api/certificatePolicies";
import { IssuerType, useGetCertificateProfileById } from "@app/hooks/api/certificateProfiles";
import { TProfileCustomExtension } from "@app/hooks/api/certificateProfiles/types";
import {
  certKeyAlgorithms,
  EXTENDED_KEY_USAGES_OPTIONS,
  getCaSignatureIncompatibilityReason,
  KEY_USAGES_OPTIONS,
  SIGNATURE_ALGORITHMS_OPTIONS
} from "@app/hooks/api/certificates/constants";
import {
  CertificateIssuerKind,
  CertificateRenewalKeySource
} from "@app/hooks/api/certificates/enums";
import {
  useGetCertificateById,
  useGetCertificateRenewalPreview
} from "@app/hooks/api/certificates/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { useWizardSteps } from "@app/hooks/useWizardSteps";
import { PkiDocsUrls } from "@app/pages/cert-manager/pki-docs-urls";
import {
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { AlgorithmSelectors } from "./AlgorithmSelectors";
import { BasicConstraintsField } from "./BasicConstraintsField";
import { buildPolicyRules, withRequiredRows } from "./certificatePolicyGuidance";
import {
  buildRenewalFormDefaults,
  buildRenewalRequestAttributes,
  capTtlToDays,
  getRemovedCertificateNames,
  getRemovedCertificateNamesFromCsr,
  unionUsageOptions
} from "./certificateRenewalUtils";
import { isExternalTemplateCa, rowErrorsOf } from "./certificateUtils";
import { CertificateWizardSheet, WizardStep } from "./CertificateWizardSheet";
import { IssuerModifiedNotice } from "./IssuerModifiedNotice";
import { KeyUsageSection } from "./KeyUsageSection";
import { RequestCustomExtensionsField } from "./RequestCustomExtensionsField";
import { SubjectAltNamesField } from "./SubjectAltNamesField";
import { SubjectAttributesField } from "./SubjectAttributesField";
import {
  DEFAULT_TEMPLATE_CONSTRAINTS,
  deriveTemplateConstraints,
  useCertificatePolicyOptions
} from "./useCertificatePolicy";
import { usePolicyGuidance } from "./usePolicyGuidance";
import { ValidityField } from "./ValidityField";

const formSchema = z
  .object({
    keySource: z.nativeEnum(CertificateRenewalKeySource),
    reissue: z.boolean().default(false),
    csr: z.string().trim().optional(),
    ttl: z.string().trim().min(1, "TTL is required"),
    subjectAttributes: z
      .array(
        z.object({
          type: z.nativeEnum(CertSubjectAttributeType),
          value: z.string().trim().min(1, "Value is required")
        })
      )
      .default([]),
    subjectAltNames: z
      .array(
        z.object({
          type: z.nativeEnum(CertSubjectAlternativeNameType),
          value: z.string().trim().min(1, "Value is required")
        })
      )
      .default([]),
    basicConstraints: z
      .object({
        isCA: z.boolean().default(false),
        pathLength: z.number().min(0).nullable().optional()
      })
      .default({ isCA: false }),
    signatureAlgorithm: z.string().optional(),
    keyAlgorithm: z.string().optional(),
    keyUsages: z.record(z.boolean().optional()).default({}),
    extendedKeyUsages: z.record(z.boolean().optional()).default({}),
    customExtensions: z
      .array(
        z.object({ oid: z.string().trim(), value: z.string(), critical: z.boolean().optional() })
      )
      .default([]),
    renewsFromStoredCsr: z.boolean().default(false)
  })
  .superRefine((data, ctx) => {
    if (data.keySource === CertificateRenewalKeySource.Csr && !data.csr) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["csr"],
        message: "A certificate signing request is required"
      });
    }
    if (data.keySource !== CertificateRenewalKeySource.Csr && !data.renewsFromStoredCsr) {
      if (!data.signatureAlgorithm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["signatureAlgorithm"],
          message: "Signature algorithm is required"
        });
      }
      if (data.keySource === CertificateRenewalKeySource.New && !data.keyAlgorithm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["keyAlgorithm"],
          message: "Key algorithm is required"
        });
      }
    }
  });

const externalTemplateFormSchema = formSchema.innerType().omit({ ttl: true }).extend({
  ttl: z.string().trim().optional()
});

export type RenewalFormData = z.infer<typeof formSchema>;

type RenewalStepKey = "setup" | "csr" | "storedCsr" | "subject" | "options" | "extensions";

const NO_RENEWAL_DECLARATIONS: TProfileCustomExtension[] = [];

const STEP_META: Record<RenewalStepKey, WizardStep> = {
  setup: {
    name: "Renewal Setup",
    shortDescription: "Key pair",
    subtitle: "Choose how this renewal handles the key pair.",
    rightDescription:
      "Decide whether the renewed certificate reuses the existing key pair or generates a new one. The key algorithm is fixed whenever the key is reused."
  },
  csr: {
    name: "Signing Request",
    shortDescription: "CSR and validity",
    subtitle: "Provide the CSR and set the validity for this renewal.",
    rightDescription:
      "The subject and key are taken from the CSR you provide, so there are no separate subject or key usage fields. Validity is set here, and custom extensions on the next step."
  },
  storedCsr: {
    name: "Validity",
    shortDescription: "Validity",
    subtitle: "Set the validity for this renewal.",
    rightDescription:
      "This renewal reuses the signing request Infisical holds for the certificate's key, so the subject, names, and key come from that request and can't be changed here. Validity is set here, and custom extensions on the next step."
  },
  subject: {
    name: "Subject",
    shortDescription: "Names and SANs",
    subtitle: "These are copied from the current certificate. Change only what should differ.",
    rightDescription:
      "Subject attributes and alternative names identify the certificate. They start as a copy of the current certificate, and the profile's policy still constrains what they may contain."
  },
  options: {
    name: "Options",
    shortDescription: "Validity and key usage",
    title: "Certificate Options",
    subtitle: "Set validity, algorithms, and key usages within the profile's policy.",
    rightDescription:
      "Profile defaults are not applied on renewal. Every value here starts as a copy of the current certificate and is validated against the profile's policy at issuance."
  },
  extensions: {
    name: "Custom Extensions",
    shortDescription: "Extension values",
    subtitle: "These are copied from the current certificate. Change only what should differ.",
    rightDescription:
      "Custom extensions start as a copy of the current certificate, and the profile's policy still constrains which object identifiers are permitted and what values they may take."
  }
};

const REPLAYED_STEP_COPY: Partial<Record<RenewalStepKey, Partial<WizardStep>>> = {
  subject: {
    subtitle: "These are copied from the original request. Change only what should differ.",
    rightDescription:
      "Subject attributes and alternative names identify the certificate. They start as a copy of the request that produced it, so anything the authority added on its own is called out below rather than repeated here."
  },
  options: {
    rightDescription:
      "Every value here starts as a copy of the request that produced this certificate, including any profile defaults it recorded, and is validated against the profile's policy at issuance."
  },
  extensions: {
    subtitle: "These are copied from the original request. Change only what should differ.",
    rightDescription:
      "Custom extensions start as a copy of the request that produced this certificate, and the profile's policy still constrains which object identifiers are permitted and what values they may take."
  }
};

const EXTERNAL_TEMPLATE_OPTIONS_STEP: WizardStep = {
  ...STEP_META.options,
  shortDescription: "Key algorithm",
  subtitle: "Choose the key algorithm for the renewed certificate.",
  rightDescription:
    "The issuing certificate authority takes validity, key usages, extended key usages and basic constraints from its own certificate template, so they cannot be set here."
};

const EXTERNAL_TEMPLATE_CSR_STEP: WizardStep = {
  ...STEP_META.csr,
  shortDescription: "CSR",
  subtitle: "Provide the CSR for this renewal.",
  rightDescription:
    "The subject and key are taken from the CSR you provide. The issuing certificate authority takes validity from its own certificate template, so it cannot be set here."
};

const EXTERNAL_TEMPLATE_STEP_META: Partial<Record<RenewalStepKey, WizardStep>> = {
  options: EXTERNAL_TEMPLATE_OPTIONS_STEP,
  csr: EXTERNAL_TEMPLATE_CSR_STEP
};

const REISSUE_STEP_COPY: Partial<Record<RenewalStepKey, Partial<WizardStep>>> = {
  setup: {
    shortDescription: "Order and key pair",
    subtitle: "Choose the DigiCert order and the key pair.",
    rightDescription: "Reissuing puts the new certificate on the same DigiCert order."
  },
  csr: {
    shortDescription: "CSR",
    subtitle: "Provide the CSR for this reissue.",
    rightDescription:
      "The subject and key are taken from the CSR you provide, so there are no separate subject or key usage fields."
  },
  options: {
    shortDescription: "Algorithms and key usage",
    subtitle: "Set algorithms and key usages within the profile's policy."
  }
};

type TChoiceOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  isDisabled?: boolean;
  disabledReason?: string;
};

const ChoiceCards = <T extends string>({
  label,
  idPrefix,
  value,
  onChange,
  options
}: {
  label: string;
  idPrefix: string;
  value: T;
  onChange: (value: T) => void;
  options: TChoiceOption<T>[];
}) => {
  const [openReasonFor, setOpenReasonFor] = useState<T | null>(null);

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>
        <RadioGroup value={value} onValueChange={(next) => onChange(next as T)} className="gap-2">
          {options.map((option) => {
            const card = (
              <FieldLabel
                key={option.value}
                htmlFor={`${idPrefix}-${option.value}`}
                variant="project"
              >
                <Field orientation="horizontal" className="items-center gap-3">
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-medium text-foreground">{option.label}</p>
                    <p className="text-xs text-muted">
                      {option.isDisabled
                        ? "Not available for this certificate."
                        : option.description}
                    </p>
                  </div>
                  {option.isDisabled && (
                    <span id={`${idPrefix}-${option.value}-reason`} className="sr-only">
                      {option.disabledReason}
                    </span>
                  )}
                  <RadioGroupItem
                    id={`${idPrefix}-${option.value}`}
                    value={option.value}
                    disabled={option.isDisabled}
                    aria-describedby={
                      option.isDisabled ? `${idPrefix}-${option.value}-reason` : undefined
                    }
                    className="sr-only"
                  />
                </Field>
              </FieldLabel>
            );
            if (!option.isDisabled) return card;
            return (
              <Tooltip
                key={option.value}
                open={openReasonFor === option.value}
                onOpenChange={(isReasonOpen) =>
                  setOpenReasonFor(isReasonOpen ? option.value : null)
                }
              >
                <TooltipTrigger
                  asChild
                  onClick={(event) => {
                    // Radix closes a tooltip on click and never opens one on tap.
                    event.preventDefault();
                    setOpenReasonFor(option.value);
                  }}
                >
                  {/* The disabled radio drops pointer events and focus, so the wrapper carries the hover and focus. */}
                  {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                  <span tabIndex={0} className="block">
                    {card}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-80">
                  {option.disabledReason}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </RadioGroup>
      </FieldContent>
    </Field>
  );
};

const REISSUE_MAX_VALIDITY_DAYS = 199;

const REISSUE_VALIDITY_DESCRIPTION = `Same as the current certificate, up to ${REISSUE_MAX_VALIDITY_DAYS} days. DigiCert also caps it at the end of the order.`;

enum DigiCertOrderChoice {
  NewOrder = "new-order",
  Reissue = "reissue"
}

const STEP_FIELDS: Record<RenewalStepKey, string[]> = {
  setup: ["keySource"],
  csr: ["csr", "ttl"],
  storedCsr: ["ttl"],
  subject: ["subjectAttributes", "subjectAltNames"],
  options: [
    "ttl",
    "signatureAlgorithm",
    "keyAlgorithm",
    "keyUsages",
    "extendedKeyUsages",
    "basicConstraints"
  ],
  extensions: ["customExtensions"]
};

type Props = {
  popUp: UsePopUpState<["renewCertificate"]>;
  applicationName?: string;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["renewCertificate"]>,
    state?: boolean
  ) => void;
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

const NameRemovalWarning = ({ names }: { names: string[] }) => (
  <Alert variant="warning">
    <TriangleAlertIcon />
    <AlertTitle>DigiCert will revoke the current certificate</AlertTitle>
    <AlertDescription>
      This reissue removes {names.join(", ")}. Once the new certificate is issued, DigiCert revokes
      the current certificate and any earlier reissues and duplicates on this order within 72 hours.
    </AlertDescription>
  </Alert>
);

export const CertificateRenewalModal = ({ popUp, applicationName, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();

  const isOpen = Boolean(popUp?.renewCertificate?.isOpen);
  const { certificateId, canRevoke = true } =
    (popUp?.renewCertificate?.data as { certificateId?: string; canRevoke?: boolean }) ?? {};

  const { data: certificateData } = useGetCertificateById(
    isOpen && certificateId ? certificateId : ""
  );
  const certificate = certificateData?.certificate;

  const { data: renewalPreview, isPending: isRenewalPreviewPending } =
    useGetCertificateRenewalPreview(isOpen && certificateId ? certificateId : "");
  const hasOriginatingRequest = renewalPreview?.hasOriginatingRequest ?? false;
  const issuerModifiedFields = renewalPreview?.issuerModifiedFields ?? [];

  const { data: profile } = useGetCertificateProfileById({
    profileId: certificate?.profileId ?? ""
  });
  const { data: policyData } = useGetCertificatePolicyById({
    policyId: profile?.certificatePolicyId ?? "",
    applicationId: certificate?.applicationId ?? undefined
  });

  const isExternalTemplateProfile = isExternalTemplateCa(
    profile?.certificateAuthority?.externalType
  );
  const caSupportsCustomExtensions = caSupportsCapability(
    (profile?.certificateAuthority?.externalType as CaType | undefined) ?? CaType.INTERNAL,
    CaCapability.CUSTOM_EXTENSIONS
  );
  const isExternalTemplateProfileRef = useRef(false);
  isExternalTemplateProfileRef.current = isExternalTemplateProfile;

  const constraints = useMemo(
    () => (policyData ? deriveTemplateConstraints(policyData) : DEFAULT_TEMPLATE_CONSTRAINTS),
    [policyData]
  );

  const isPolicyResolved =
    Boolean(policyData) || (Boolean(profile) && !profile?.certificatePolicyId);
  const {
    filteredKeyUsages,
    filteredExtendedKeyUsages,
    availableSignatureAlgorithms,
    availableKeyAlgorithms
  } = useCertificatePolicyOptions(constraints);

  const { mutateAsync: renewCertificate } = useRenewCertificate();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    trigger,
    clearErrors,
    formState,
    formState: { isSubmitting }
  } = useForm<RenewalFormData>({
    resolver: (values, context, options) =>
      zodResolver(isExternalTemplateProfileRef.current ? externalTemplateFormSchema : formSchema)(
        values,
        context,
        options
      ),
    defaultValues: {
      keySource: CertificateRenewalKeySource.New,
      reissue: false,
      ttl: "",
      subjectAttributes: [],
      subjectAltNames: [],
      basicConstraints: { isCA: false },
      keyUsages: {},
      extendedKeyUsages: {},
      customExtensions: [],
      renewsFromStoredCsr: false
    }
  });

  const keySource = watch("keySource");
  const isReissueAvailable =
    certificate?.externalMetadata?.type === CaType.DIGICERT &&
    caSupportsCapability(
      (profile?.certificateAuthority?.externalType as CaType | undefined) ?? CaType.INTERNAL,
      CaCapability.REISSUE_CERTIFICATES
    );
  const isReissuing = isReissueAvailable && watch("reissue");
  const getReissueRemovedNames = () => {
    if (!isReissuing || !certificate) return [];
    if (keySource === CertificateRenewalKeySource.Csr) {
      return getRemovedCertificateNamesFromCsr({ certificate, csr: watch("csr") });
    }
    return getRemovedCertificateNames({
      certificate,
      formData: {
        subjectAttributes: watch("subjectAttributes"),
        subjectAltNames: watch("subjectAltNames")
      },
      constraints
    });
  };
  const removedNames = getReissueRemovedNames();
  const nameRemovalError =
    removedNames.length && !canRevoke
      ? "Removing or changing a name on a reissue revokes the current certificate, and you don't have permission to revoke it."
      : undefined;
  const [pendingNameRemovalRenewal, setPendingNameRemovalRenewal] =
    useState<RenewalFormData | null>(null);
  const [isConfirmingNameRemoval, setIsConfirmingNameRemoval] = useState(false);
  const watchedIsCA = watch("basicConstraints.isCA") || false;
  const sanTypesInForm = (watch("subjectAltNames") ?? []).map((san) => san.type).join(",");
  const watchedKeyUsages = Object.keys(watch("keyUsages") ?? {})
    .sort()
    .join(",");
  const watchedExtendedKeyUsages = Object.keys(watch("extendedKeyUsages") ?? {})
    .sort()
    .join(",");
  const subjectTypesInForm = (watch("subjectAttributes") ?? []).map((attr) => attr.type).join(",");

  const selectableSanTypes = useMemo(
    () =>
      Array.from(
        new Set([
          ...constraints.allowedSanTypes,
          ...(sanTypesInForm ? (sanTypesInForm.split(",") as CertSubjectAlternativeNameType[]) : [])
        ])
      ),
    [constraints.allowedSanTypes, sanTypesInForm]
  );

  // Same reason as the SAN types above: a certificate can carry a usage its policy no longer allows.
  // Rendering it keeps it visible and unsettable, instead of submitting a checkbox nobody can see.
  const selectableKeyUsages = useMemo(
    () => unionUsageOptions(filteredKeyUsages, KEY_USAGES_OPTIONS, watchedKeyUsages),
    [filteredKeyUsages, watchedKeyUsages]
  );
  const selectableExtendedKeyUsages = useMemo(
    () =>
      unionUsageOptions(
        filteredExtendedKeyUsages,
        EXTENDED_KEY_USAGES_OPTIONS,
        watchedExtendedKeyUsages
      ),
    [filteredExtendedKeyUsages, watchedExtendedKeyUsages]
  );

  const watchedKeyAlgorithm = watch("keyAlgorithm");
  const watchedSignatureAlgorithm = watch("signatureAlgorithm");
  const selectableKeyAlgorithms = useMemo(
    () => unionUsageOptions(availableKeyAlgorithms, certKeyAlgorithms, watchedKeyAlgorithm ?? ""),
    [availableKeyAlgorithms, watchedKeyAlgorithm]
  );
  const selectableSignatureAlgorithms = useMemo(
    () =>
      unionUsageOptions(
        availableSignatureAlgorithms,
        SIGNATURE_ALGORITHMS_OPTIONS,
        watchedSignatureAlgorithm ?? ""
      ),
    [availableSignatureAlgorithms, watchedSignatureAlgorithm]
  );

  const caKeyAlgorithm = profile?.certificateAuthority?.keyAlgorithm;

  // The form seeds this from the existing certificate, which the same fixed CA signed, so a mismatch
  // should be unreachable. Kept as a guard because the seeded value is submitted untouched by default,
  // and the field asking again beats posting one the CA is guaranteed to reject.
  useEffect(() => {
    if (!isOpen || !watchedSignatureAlgorithm) return;
    if (getCaSignatureIncompatibilityReason(watchedSignatureAlgorithm, caKeyAlgorithm)) {
      setValue("signatureAlgorithm", "");
    }
  }, [isOpen, watchedSignatureAlgorithm, caKeyAlgorithm, setValue]);

  const selectableSubjectAttributeTypes = useMemo(
    () =>
      Array.from(
        new Set([
          ...constraints.allowedSubjectAttributeTypes,
          ...(subjectTypesInForm
            ? (subjectTypesInForm.split(",") as CertSubjectAttributeType[])
            : [])
        ])
      ),
    [constraints.allowedSubjectAttributeTypes, subjectTypesInForm]
  );

  const isSelfSigned = certificate
    ? (profile?.issuerType ?? (certificate.caId ? IssuerType.CA : IssuerType.SELF_SIGNED)) ===
      IssuerType.SELF_SIGNED
    : false;
  const isIssuedByAcm = profile?.certificateAuthority?.externalType === CaType.AWS_ACM_PUBLIC_CA;
  const isKeyless = certificate?.hasPrivateKey === false;
  const cannotRenewFromCsr =
    certificate?.canRenewFromCsr === undefined
      ? renewalPreview?.hasOriginatingCsr === false
      : !certificate.canRenewFromCsr;
  let reuseRefusalReason: string | undefined;
  if (isSelfSigned && isKeyless) {
    reuseRefusalReason =
      "Infisical does not hold this certificate's private key, which is what signs a self-signed certificate.";
  } else if (isIssuedByAcm) {
    reuseRefusalReason =
      "AWS Certificate Manager can't issue from a signing request, so it can't reuse a key pair. Generate a new key pair.";
  } else if (!isSelfSigned && isKeyless && cannotRenewFromCsr) {
    reuseRefusalReason =
      "Infisical holds neither this certificate's private key nor a signing request it can renew from. Generate a new key pair, or use a CSR generated from the existing key.";
  } else if (
    !isSelfSigned &&
    certificate?.caType === CertificateIssuerKind.External &&
    !isKeyless
  ) {
    reuseRefusalReason =
      "This certificate authority can reuse a key pair only from a signing request, not from a private key Infisical holds. Generate a new key pair, or export the private key and use a CSR generated from it.";
  }
  let csrRefusalReason: string | undefined;
  if (isSelfSigned) {
    csrRefusalReason =
      "A self-signed certificate is signed by its own private key, which a signing request does not carry.";
  } else if (isIssuedByAcm) {
    csrRefusalReason = "AWS Certificate Manager can't issue from a signing request.";
  }
  const isReuseAllowed = !reuseRefusalReason;
  const isCsrAllowed = !csrRefusalReason;

  useEffect(() => {
    const isRefused =
      (keySource === CertificateRenewalKeySource.Reuse && !isReuseAllowed) ||
      (keySource === CertificateRenewalKeySource.Csr && !isCsrAllowed);
    if (isRefused) setValue("keySource", CertificateRenewalKeySource.New);
  }, [keySource, isReuseAllowed, isCsrAllowed, setValue]);

  // Without the private key, Reuse renews from the stored CSR exactly like "Use a CSR", so the CSR fixes
  // the subject, names, key usages and algorithms, and only validity and extensions can be set.
  const renewsFromStoredCsr = keySource === CertificateRenewalKeySource.Reuse && isKeyless;
  useEffect(() => {
    setValue("renewsFromStoredCsr", renewsFromStoredCsr);
  }, [renewsFromStoredCsr, setValue]);

  const showCustomExtensions =
    policyData?.customExtensions?.length !== 0 && caSupportsCustomExtensions;

  const stepKeys = useMemo<RenewalStepKey[]>(() => {
    if (keySource === CertificateRenewalKeySource.Csr) {
      return showCustomExtensions ? ["setup", "csr", "extensions"] : ["setup", "csr"];
    }
    if (renewsFromStoredCsr) {
      // A template CA sets validity itself, which leaves this step with nothing to ask.
      const keys: RenewalStepKey[] = ["setup"];
      if (!isExternalTemplateProfile) keys.push("storedCsr");
      if (showCustomExtensions) keys.push("extensions");
      return keys;
    }
    const keys: RenewalStepKey[] = ["setup"];
    if (constraints.shouldShowSubjectSection || constraints.shouldShowSanSection)
      keys.push("subject");
    keys.push("options");
    if (showCustomExtensions) {
      keys.push("extensions");
    }
    return keys;
  }, [
    keySource,
    renewsFromStoredCsr,
    isExternalTemplateProfile,
    constraints.shouldShowSubjectSection,
    constraints.shouldShowSanSection,
    showCustomExtensions
  ]);

  const policy = usePolicyGuidance({
    policy: policyData,
    watch,
    clearErrors,
    isSubjectSectionShown: constraints.shouldShowSubjectSection,
    isSanSectionShown: constraints.shouldShowSanSection,
    isSubjectEvaluated: keySource !== CertificateRenewalKeySource.Csr && !renewsFromStoredCsr,
    isValidityEvaluated: !isExternalTemplateProfile,
    resetKey: certificate?.id
  });

  const { step, setStep, currentStepKey, goBack, goNext, onFormInvalid } = useWizardSteps({
    stepKeys,
    stepFields: STEP_FIELDS,
    invalidMessage: "Please fix the highlighted fields before renewing.",
    validateStep: async (fields) => {
      // Leaving a step reveals the findings on its own fields; entering it must stay quiet.
      policy.reveal(fields);
      if (nameRemovalError && (fields.includes("subjectAltNames") || fields.includes("csr")))
        return false;
      if (!(await trigger(fields as (keyof RenewalFormData)[]))) return false;
      return policy.findBlockedFields(fields).length === 0;
    }
  });

  const steps = useMemo(
    () =>
      stepKeys.map((key) => {
        const meta = isExternalTemplateProfile
          ? (EXTERNAL_TEMPLATE_STEP_META[key] ?? STEP_META[key])
          : STEP_META[key];
        const replayedMeta = hasOriginatingRequest
          ? { ...meta, ...(REPLAYED_STEP_COPY[key] ?? {}) }
          : meta;
        const showsReissueCopy = key === "setup" ? isReissueAvailable : isReissuing;
        return showsReissueCopy
          ? { ...replayedMeta, ...(REISSUE_STEP_COPY[key] ?? {}) }
          : replayedMeta;
      }),
    [stepKeys, isExternalTemplateProfile, hasOriginatingRequest, isReissueAvailable, isReissuing]
  );

  const subjectIssuerChanges = useMemo(
    () => issuerModifiedFields.filter((entry) => SUBJECT_ISSUER_FIELDS.has(entry.field)),
    [issuerModifiedFields]
  );

  const extensionsIssuerChanges = useMemo(
    () => issuerModifiedFields.filter((entry) => entry.field === "customExtensions"),
    [issuerModifiedFields]
  );

  // Without an extensions step, the options step is the only place left to show extension changes.
  const optionsIssuerChanges = useMemo(
    () =>
      issuerModifiedFields.filter((entry) => {
        if (SUBJECT_ISSUER_FIELDS.has(entry.field)) return false;
        if (entry.field === "customExtensions") return !showCustomExtensions;
        return entry.field === "keyAlgorithm" || !isExternalTemplateProfile;
      }),
    [issuerModifiedFields, isExternalTemplateProfile, showCustomExtensions]
  );

  const [isSeeded, setIsSeeded] = useState(false);
  const seededCertificateIdRef = useRef<string | null>(null);
  const seededTtlRef = useRef("");
  const newOrderTtlRef = useRef("");
  useEffect(() => {
    if (!isOpen) {
      seededCertificateIdRef.current = null;
      setIsSeeded(false);
      return;
    }
    if (
      !certificate ||
      !isPolicyResolved ||
      isRenewalPreviewPending ||
      seededCertificateIdRef.current === certificate.id
    )
      return;

    seededCertificateIdRef.current = certificate.id;
    const renewalDefaults = buildRenewalFormDefaults(certificate, constraints, renewalPreview);
    seededTtlRef.current = renewalDefaults.ttl ?? "";
    newOrderTtlRef.current = "";
    // Seed the rows the policy requires so they are visible as fields from the start.
    const seeded = withRequiredRows(
      buildPolicyRules(policyData),
      renewalDefaults.subjectAttributes ?? [],
      renewalDefaults.subjectAltNames ?? []
    );
    reset({
      ...renewalDefaults,
      reissue: getValues("reissue"),
      subjectAttributes: seeded.subjectAttributes,
      subjectAltNames: seeded.subjectAltNames
    });
    setStep(0);
    setIsSeeded(true);
  }, [
    isOpen,
    certificate,
    isPolicyResolved,
    isRenewalPreviewPending,
    renewalPreview,
    constraints,
    policyData,
    reset,
    getValues
  ]);

  useEffect(() => {
    if (!isSeeded || !seededTtlRef.current) return;
    if (isReissuing) {
      newOrderTtlRef.current = getValues("ttl");
      setValue("ttl", capTtlToDays(seededTtlRef.current, REISSUE_MAX_VALIDITY_DAYS));
      return;
    }
    setValue("ttl", newOrderTtlRef.current || seededTtlRef.current);
  }, [isSeeded, isReissuing, getValues, setValue]);

  const closeWizard = () => {
    handlePopUpToggle("renewCertificate", false);
    reset();
    setStep(0);
  };

  const submitRenewal = async (formData: RenewalFormData) => {
    if (!certificateId) return;

    const attributes = buildRenewalRequestAttributes({
      formData,
      constraints,
      isExternalTemplateProfile
    });
    const result = await renewCertificate({
      certificateId,
      renewalKeySource: formData.keySource,
      ...(formData.keySource === CertificateRenewalKeySource.Csr && { csr: formData.csr }),
      ...(isReissuing && { externalConfiguration: { reissue: true } }),
      attributes: isReissuing ? { ...attributes, ttl: undefined } : attributes
    });

    let notificationText = `Certificate renewal submitted. This may take a few minutes to process. Certificate Request ID: ${result.certificateRequestId}`;
    if (isReissuing) {
      notificationText = `Certificate reissue submitted. This may take a few minutes to process. Certificate Request ID: ${result.certificateRequestId}`;
    } else if (result.certificate) {
      notificationText = "Certificate renewed successfully";
    }
    createNotification({ text: notificationText, type: "success" });

    closeWizard();

    if (currentOrg?.id && currentProject?.id && result.certificateId && result.certificate) {
      navigate({
        to: "/organizations/$orgId/cert-manager/certificates/$certificateId",
        params: {
          orgId: currentOrg.id,
          certificateId: result.certificateId
        },
        ...(applicationName && { search: { fromApplication: applicationName } })
      });
    }
  };

  const onFormSubmit = async (formData: RenewalFormData) => {
    if (!certificateId) return;

    // Reachable when a step was skipped or its values changed after it was cleared. Reveal the
    // whole offending step, so the finding is visible wherever in it the requester lands.
    const [blockedField] = policy.findBlockedFields(stepKeys.flatMap((key) => STEP_FIELDS[key]));
    if (blockedField) {
      const blockedStep = stepKeys.findIndex((key) => STEP_FIELDS[key].includes(blockedField));
      policy.reveal(blockedStep >= 0 ? STEP_FIELDS[stepKeys[blockedStep]] : [blockedField]);
      if (blockedStep >= 0) setStep(blockedStep);
      createNotification({
        text: "Resolve the policy violations before renewing this certificate.",
        type: "error"
      });
      return;
    }

    if (nameRemovalError) {
      const namesStep = stepKeys.indexOf(
        keySource === CertificateRenewalKeySource.Csr ? "csr" : "subject"
      );
      if (namesStep >= 0) setStep(namesStep);
      createNotification({ text: nameRemovalError, type: "error" });
      return;
    }

    if (removedNames.length) {
      setPendingNameRemovalRenewal(formData);
      return;
    }

    await submitRenewal(formData);
  };

  const confirmNameRemoval = async () => {
    if (!pendingNameRemovalRenewal) return;
    setIsConfirmingNameRemoval(true);
    try {
      await submitRenewal(pendingNameRemovalRenewal);
    } finally {
      setIsConfirmingNameRemoval(false);
      setPendingNameRemovalRenewal(null);
    }
  };

  const keySourceOptions = useMemo(
    () => [
      {
        value: CertificateRenewalKeySource.Reuse,
        label: "Reuse the existing key pair",
        description: certificate?.hasPrivateKey
          ? "Keep the same private and public key."
          : "Renew from the signing request Infisical holds for this key. Its names stay the same; only validity and extensions can change.",
        isDisabled: !isReuseAllowed,
        disabledReason: reuseRefusalReason
      },
      {
        value: CertificateRenewalKeySource.New,
        label: "Generate a new key pair",
        description: "Issue the certificate with a brand new key.",
        isDisabled: false
      },
      {
        value: CertificateRenewalKeySource.Csr,
        label: "Use a CSR",
        description: "Provide a certificate signing request with its own key.",
        isDisabled: !isCsrAllowed,
        disabledReason: csrRefusalReason
      }
    ],
    [certificate?.hasPrivateKey, isReuseAllowed, isCsrAllowed, reuseRefusalReason, csrRefusalReason]
  );

  return (
    <CertificateWizardSheet
      isOpen={isOpen}
      onOpenChange={(open) => (open ? handlePopUpToggle("renewCertificate", true) : closeWizard())}
      icon={<RefreshCw className="h-5 w-5" />}
      title={isReissuing ? "Reissue Certificate" : "Renew Certificate"}
      description={certificate?.commonName || certificate?.friendlyName || "Certificate"}
      steps={steps}
      activeStep={step}
      onStepChange={setStep}
      docsHref={PkiDocsUrls.applications.certificateRenewal}
      submitLabel={isReissuing ? "Reissue Certificate" : "Renew Certificate"}
      onSubmit={handleSubmit(onFormSubmit, onFormInvalid)}
      onBack={goBack}
      onContinue={goNext}
      isSubmitting={isSubmitting || isConfirmingNameRemoval}
      isSubmitDisabled={!certificate || !isSeeded}
      isContinueDisabled={!certificate || !isSeeded}
    >
      {currentStepKey === "setup" && (
        <div className="space-y-6">
          {isReissueAvailable && (
            <Controller
              control={control}
              name="reissue"
              render={({ field: { onChange, value } }) => (
                <ChoiceCards
                  label="DigiCert order"
                  idPrefix="digicert-order"
                  value={value ? DigiCertOrderChoice.Reissue : DigiCertOrderChoice.NewOrder}
                  onChange={(choice) => onChange(choice === DigiCertOrderChoice.Reissue)}
                  options={[
                    {
                      value: DigiCertOrderChoice.NewOrder,
                      label: "Place a new order",
                      description: "Issues the certificate on a new DigiCert order."
                    },
                    {
                      value: DigiCertOrderChoice.Reissue,
                      label: "Reissue the existing order",
                      description:
                        "Issues the certificate on the same DigiCert order, so it can't outlast the order. For longer coverage, place a new order. Removing or changing a name revokes the current certificate and any earlier copies on the order within 72 hours."
                    }
                  ]}
                />
              )}
            />
          )}
          <Controller
            control={control}
            name="keySource"
            render={({ field: { onChange, value } }) => (
              <ChoiceCards
                label="Key pair"
                idPrefix="key-source"
                value={value}
                onChange={onChange}
                options={keySourceOptions}
              />
            )}
          />
        </div>
      )}

      {currentStepKey === "csr" && (
        <div className="space-y-4">
          <Controller
            control={control}
            name="csr"
            render={({ field: { value, ...field }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>
                  Certificate signing request <span className="text-danger">*</span>
                </FieldLabel>
                <TextArea
                  {...field}
                  value={value ?? ""}
                  spellCheck={false}
                  isError={Boolean(error || nameRemovalError)}
                  placeholder="-----BEGIN CERTIFICATE REQUEST-----"
                  rows={12}
                  className="w-full font-mono text-xs"
                />
                <FieldDescription>
                  The subject, key, and extensions are taken from this CSR.
                </FieldDescription>
                <FieldError
                  errors={[error ?? (nameRemovalError ? { message: nameRemovalError } : undefined)]}
                />
              </Field>
            )}
          />
          {removedNames.length > 0 && !nameRemovalError && (
            <NameRemovalWarning names={removedNames} />
          )}
          {!isExternalTemplateProfile && (
            <ValidityField
              control={control}
              label="Validity (TTL)"
              isReadOnly={isReissuing}
              description={isReissuing ? REISSUE_VALIDITY_DESCRIPTION : undefined}
              hint={policy.ttlHint}
              policyError={policy.ttlError}
              revealPolicyError={policy.isRevealed("ttl")}
            />
          )}
        </div>
      )}

      {currentStepKey === "storedCsr" && (
        <div className="space-y-4">
          <ValidityField
            control={control}
            label="Validity (TTL)"
            isReadOnly={isReissuing}
            description={isReissuing ? REISSUE_VALIDITY_DESCRIPTION : undefined}
            hint={policy.ttlHint}
            policyError={policy.ttlError}
            revealPolicyError={policy.isRevealed("ttl")}
          />
        </div>
      )}

      {currentStepKey === "subject" && (
        <div className="space-y-4">
          {constraints.shouldShowSubjectSection && (
            <SubjectAttributesField
              control={control}
              allowedAttributeTypes={selectableSubjectAttributeTypes}
              error={
                (!constraints.shouldShowSanSection && nameRemovalError) ||
                (formState.errors as { subjectAttributes?: { message?: string } }).subjectAttributes
                  ?.message
              }
              rowErrors={rowErrorsOf(
                (formState.errors as { subjectAttributes?: unknown }).subjectAttributes
              )}
              policyRows={policy.subject.rows}
              policyNotices={policy.subject.notices}
              revealPolicyErrors={policy.isRevealed("subjectAttributes")}
            />
          )}
          {constraints.shouldShowSanSection && (
            <SubjectAltNamesField
              control={control}
              allowedSanTypes={selectableSanTypes}
              error={
                nameRemovalError ??
                (formState.errors as { subjectAltNames?: { message?: string } }).subjectAltNames
                  ?.message
              }
              rowErrors={rowErrorsOf(
                (formState.errors as { subjectAltNames?: unknown }).subjectAltNames
              )}
              policyRows={policy.sans.rows}
              policyNotices={policy.sans.notices}
              revealPolicyErrors={policy.isRevealed("subjectAltNames")}
            />
          )}
          {removedNames.length > 0 && !nameRemovalError && (
            <NameRemovalWarning names={removedNames} />
          )}
          <IssuerModifiedNotice fields={subjectIssuerChanges} />
        </div>
      )}

      {currentStepKey === "extensions" && (
        <div className="space-y-4">
          <RequestCustomExtensionsField
            control={control}
            declarations={NO_RENEWAL_DECLARATIONS}
            policyRules={policyData?.customExtensions}
            errorsByOid={policy.customExtensions.errorsByOid}
            revealPolicyErrors={policy.isRevealed("customExtensions")}
          />
          <IssuerModifiedNotice fields={extensionsIssuerChanges} />
        </div>
      )}

      {currentStepKey === "options" && (
        <div className="space-y-4">
          {!isExternalTemplateProfile && (
            <ValidityField
              control={control}
              className="mb-4"
              label="Validity (TTL)"
              isReadOnly={isReissuing}
              description={
                isReissuing
                  ? REISSUE_VALIDITY_DESCRIPTION
                  : "The renewed certificate is valid for this long, starting now."
              }
              hint={policy.ttlHint}
              policyError={policy.ttlError}
              revealPolicyError={policy.isRevealed("ttl")}
            />
          )}

          <AlgorithmSelectors
            control={control}
            availableSignatureAlgorithms={selectableSignatureAlgorithms}
            availableKeyAlgorithms={selectableKeyAlgorithms}
            caKeyAlgorithm={caKeyAlgorithm}
            keyAlgorithmDisabledReason={
              keySource === CertificateRenewalKeySource.Reuse
                ? "The key algorithm is fixed while the existing key pair is reused."
                : undefined
            }
            hideSignatureAlgorithm={isExternalTemplateProfile}
            signatureError={formState.errors.signatureAlgorithm?.message}
            keyError={formState.errors.keyAlgorithm?.message}
            keyAlgorithmRequired={keySource !== CertificateRenewalKeySource.Reuse}
            keyAlgorithmPlaceholder={
              keySource === CertificateRenewalKeySource.Reuse
                ? "Unchanged (existing key pair)"
                : "Select key algorithm"
            }
          />

          {!isExternalTemplateProfile && (
            <div className="mt-4 space-y-6">
              <div>
                <KeyUsageSection
                  control={control}
                  title="Key Usages"
                  namePrefix="keyUsages"
                  options={selectableKeyUsages}
                  requiredUsages={constraints.requiredKeyUsages}
                />
              </div>
              <div>
                <KeyUsageSection
                  control={control}
                  title="Extended Key Usages"
                  namePrefix="extendedKeyUsages"
                  options={selectableExtendedKeyUsages}
                  requiredUsages={constraints.requiredExtendedKeyUsages}
                />
              </div>
              {constraints.templateAllowsCA && (
                <BasicConstraintsField
                  control={control}
                  setValue={setValue}
                  isCA={watchedIsCA}
                  templateRequiresCA={constraints.templateRequiresCA}
                  maxPathLength={
                    constraints.maxPathLength === -1 ? undefined : constraints.maxPathLength
                  }
                  idPrefix="renewal"
                />
              )}
            </div>
          )}
          <IssuerModifiedNotice fields={optionsIssuerChanges} />
        </div>
      )}
      <AlertDialog
        open={pendingNameRemovalRenewal !== null}
        isPending={isConfirmingNameRemoval}
        onOpenChange={(open) => {
          if (!open) setPendingNameRemovalRenewal(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reissue without {removedNames.join(", ")}?</AlertDialogTitle>
            <AlertDialogDescription>
              Once the new certificate is issued, DigiCert revokes the current certificate and any
              earlier reissues and duplicates on this order within 72 hours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="danger"
              size="sm"
              isPending={isConfirmingNameRemoval}
              onClick={confirmNameRemoval}
            >
              Reissue Certificate
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CertificateWizardSheet>
  );
};
