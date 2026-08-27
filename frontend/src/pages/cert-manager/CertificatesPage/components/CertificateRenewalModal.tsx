import { useEffect, useMemo, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  RadioGroup,
  RadioGroupItem,
  TextArea
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useRenewCertificate } from "@app/hooks/api";
import { useGetCertificatePolicyById } from "@app/hooks/api/certificatePolicies";
import { IssuerType, useGetCertificateProfileById } from "@app/hooks/api/certificateProfiles";
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
import { useGetCertificateById } from "@app/hooks/api/certificates/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { PkiDocsUrls } from "@app/pages/cert-manager/pki-docs-urls";
import {
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { AlgorithmSelectors } from "./AlgorithmSelectors";
import { BasicConstraintsField } from "./BasicConstraintsField";
import { mergeRowErrors } from "./certificatePolicyGuidance";
import {
  buildRenewalFormDefaults,
  buildRenewalRequestAttributes,
  unionUsageOptions
} from "./certificateRenewalUtils";
import { isExternalTemplateCa, rowErrorsOf } from "./certificateUtils";
import { CertificateWizardSheet, useWizardSteps, WizardStep } from "./CertificateWizardSheet";
import { KeyUsageSection } from "./KeyUsageSection";
import { PolicyRequirementsAlert } from "./PolicyRequirementsAlert";
import { SubjectAltNamesField } from "./SubjectAltNamesField";
import { SubjectAttributesField } from "./SubjectAttributesField";
import {
  DEFAULT_TEMPLATE_CONSTRAINTS,
  deriveTemplateConstraints,
  useCertificatePolicyOptions
} from "./useCertificatePolicy";
import { useSubjectPolicyGuidance } from "./useSubjectPolicyGuidance";

const formSchema = z
  .object({
    keySource: z.nativeEnum(CertificateRenewalKeySource),
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
    extendedKeyUsages: z.record(z.boolean().optional()).default({})
  })
  .superRefine((data, ctx) => {
    if (data.keySource === CertificateRenewalKeySource.Csr && !data.csr) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["csr"],
        message: "A certificate signing request is required"
      });
    }
    if (data.keySource !== CertificateRenewalKeySource.Csr) {
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

type RenewalStepKey = "setup" | "csr" | "subject" | "options";

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
      "The subject, key, and extensions are all taken from the CSR you provide, so there are no separate subject or key usage fields. Only validity is set here."
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
  }
};

const EXTERNAL_TEMPLATE_OPTIONS_STEP: WizardStep = {
  ...STEP_META.options,
  shortDescription: "Key algorithm",
  subtitle: "Choose the key algorithm for the renewed certificate.",
  rightDescription:
    "The issuing certificate authority takes validity, key usages, extended key usages and basic constraints from its own certificate template, so they cannot be set here."
};

const STEP_FIELDS: Record<RenewalStepKey, string[]> = {
  setup: ["keySource"],
  csr: ["csr", "ttl"],
  subject: ["subjectAttributes", "subjectAltNames"],
  options: [
    "ttl",
    "signatureAlgorithm",
    "keyAlgorithm",
    "keyUsages",
    "extendedKeyUsages",
    "basicConstraints"
  ]
};

type Props = {
  popUp: UsePopUpState<["renewCertificate"]>;
  applicationName?: string;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["renewCertificate"]>,
    state?: boolean
  ) => void;
};

export const CertificateRenewalModal = ({ popUp, applicationName, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();

  const isOpen = Boolean(popUp?.renewCertificate?.isOpen);
  const { certificateId } = (popUp?.renewCertificate?.data as { certificateId?: string }) ?? {};

  const { data: certificateData } = useGetCertificateById(
    isOpen && certificateId ? certificateId : ""
  );
  const certificate = certificateData?.certificate;

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
    setValue,
    trigger,
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
      ttl: "",
      subjectAttributes: [],
      subjectAltNames: [],
      basicConstraints: { isCA: false },
      keyUsages: {},
      extendedKeyUsages: {}
    }
  });

  const keySource = watch("keySource");
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
  let reuseRefusalReason: string | undefined;
  if (isSelfSigned && certificate?.hasPrivateKey === false) {
    reuseRefusalReason =
      "Infisical does not hold this certificate's private key, which is what signs a self-signed certificate.";
  } else if (!isSelfSigned && certificate?.caType === CertificateIssuerKind.External) {
    reuseRefusalReason =
      "The issuing certificate authority does not support reusing an existing key pair.";
  }
  const csrRefusalReason = isSelfSigned
    ? "A self-signed certificate is signed by its own private key, which a signing request does not carry."
    : undefined;
  const isReuseAllowed = !reuseRefusalReason;
  const isCsrAllowed = !csrRefusalReason;

  useEffect(() => {
    const isRefused =
      (keySource === CertificateRenewalKeySource.Reuse && !isReuseAllowed) ||
      (keySource === CertificateRenewalKeySource.Csr && !isCsrAllowed);
    if (isRefused) setValue("keySource", CertificateRenewalKeySource.New);
  }, [keySource, isReuseAllowed, isCsrAllowed, setValue]);

  const stepKeys = useMemo<RenewalStepKey[]>(() => {
    if (keySource === CertificateRenewalKeySource.Csr) return ["setup", "csr"];
    const keys: RenewalStepKey[] = ["setup"];
    if (constraints.shouldShowSubjectSection || constraints.shouldShowSanSection)
      keys.push("subject");
    keys.push("options");
    return keys;
  }, [keySource, constraints.shouldShowSubjectSection, constraints.shouldShowSanSection]);

  const policyGuidance = useSubjectPolicyGuidance({
    policy: policyData,
    watch,
    setValue,
    isSubjectSectionShown: constraints.shouldShowSubjectSection,
    isSanSectionShown: constraints.shouldShowSanSection,
    isEnabled: keySource !== CertificateRenewalKeySource.Csr
  });

  const hasPolicyIssuesRef = useRef(false);
  hasPolicyIssuesRef.current = policyGuidance.hasBlockingIssues;

  const { step, setStep, currentStepKey, goBack, goNext, onFormInvalid } = useWizardSteps({
    stepKeys,
    stepFields: STEP_FIELDS,
    invalidMessage: "Please fix the highlighted fields before renewing.",
    validateStep: async (fields) => {
      const isValid = await trigger(fields as (keyof RenewalFormData)[]);
      if (!isValid) return false;
      // The subject step is where policy violations can be fixed, so don't let them reach renewal.
      return !fields.includes("subjectAttributes") || !hasPolicyIssuesRef.current;
    }
  });

  const steps = useMemo(
    () =>
      stepKeys.map((key) =>
        key === "options" && isExternalTemplateProfile
          ? EXTERNAL_TEMPLATE_OPTIONS_STEP
          : STEP_META[key]
      ),
    [stepKeys, isExternalTemplateProfile]
  );

  const seededCertificateIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) {
      seededCertificateIdRef.current = null;
      return;
    }
    if (!certificate || !isPolicyResolved || seededCertificateIdRef.current === certificate.id)
      return;

    seededCertificateIdRef.current = certificate.id;
    reset(buildRenewalFormDefaults(certificate, constraints));
    setStep(0);
  }, [isOpen, certificate, isPolicyResolved, constraints, reset]);

  const closeWizard = () => {
    handlePopUpToggle("renewCertificate", false);
    reset();
    setStep(0);
  };

  const onFormSubmit = async (formData: RenewalFormData) => {
    if (!certificateId) return;

    if (keySource !== CertificateRenewalKeySource.Csr && hasPolicyIssuesRef.current) {
      const subjectStepIndex = stepKeys.indexOf("subject");
      if (subjectStepIndex >= 0) setStep(subjectStepIndex);
      createNotification({
        text: "Resolve the policy violations on the Subject step before renewing.",
        type: "error"
      });
      return;
    }

    const result = await renewCertificate({
      certificateId,
      renewalKeySource: formData.keySource,
      ...(formData.keySource === CertificateRenewalKeySource.Csr && { csr: formData.csr }),
      attributes: buildRenewalRequestAttributes({
        formData,
        constraints,
        isExternalTemplateProfile
      })
    });

    createNotification({
      text: result.certificate
        ? "Certificate renewed successfully"
        : `Certificate renewal submitted. This may take a few minutes to process. Certificate Request ID: ${result.certificateRequestId}`,
      type: "success"
    });

    closeWizard();

    if (currentOrg?.id && currentProject?.id && result.certificateId && result.certificate) {
      navigate({
        to: "/organizations/$orgId/projects/cert-manager/$projectId/certificates/$certificateId",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id,
          certificateId: result.certificateId
        },
        ...(applicationName && { search: { fromApplication: applicationName } })
      });
    }
  };

  const keySourceOptions = useMemo(
    () => [
      {
        value: CertificateRenewalKeySource.Reuse,
        label: "Reuse the existing key pair",
        description: certificate?.hasPrivateKey
          ? "Keep the same private and public key."
          : "Renew from the signing request this certificate was issued from, so the public key stays the same.",
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
      title="Renew certificate"
      description={certificate?.commonName || certificate?.friendlyName || "Certificate"}
      steps={steps}
      activeStep={step}
      onStepChange={setStep}
      docsHref={PkiDocsUrls.applications.certificateRenewal}
      submitLabel="Renew certificate"
      onSubmit={handleSubmit(onFormSubmit, onFormInvalid)}
      onBack={goBack}
      onContinue={goNext}
      isSubmitting={isSubmitting}
      isSubmitDisabled={!certificate}
      isContinueDisabled={!certificate}
    >
      {currentStepKey === "setup" && (
        <Controller
          control={control}
          name="keySource"
          render={({ field: { onChange, value } }) => (
            <Field>
              <FieldLabel>Key pair</FieldLabel>
              <FieldContent>
                <RadioGroup value={value} onValueChange={onChange} className="gap-2">
                  {keySourceOptions.map((option) => (
                    <FieldLabel
                      key={option.value}
                      htmlFor={`key-source-${option.value}`}
                      variant="project"
                    >
                      <Field orientation="horizontal" className="items-center gap-3">
                        <div className="min-w-0 flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">{option.label}</p>
                          <p className="text-xs text-muted">
                            {option.isDisabled ? option.disabledReason : option.description}
                          </p>
                        </div>
                        <RadioGroupItem
                          id={`key-source-${option.value}`}
                          value={option.value}
                          disabled={option.isDisabled}
                          className="sr-only"
                        />
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              </FieldContent>
            </Field>
          )}
        />
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
                  isError={Boolean(error)}
                  placeholder="-----BEGIN CERTIFICATE REQUEST-----"
                  rows={12}
                  className="w-full font-mono text-xs"
                />
                <FieldDescription>
                  The subject, key, and extensions are taken from this CSR.
                </FieldDescription>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="ttl"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>
                  Validity (TTL) <span className="text-danger">*</span>
                </FieldLabel>
                <Input {...field} placeholder="30d, 1y, 8760h" isError={Boolean(error)} />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
      )}

      {currentStepKey === "subject" && (
        <div className="space-y-4">
          <PolicyRequirementsAlert
            requirements={policyGuidance.requirements}
            onAddMissing={policyGuidance.addMissingFields}
          />
          {constraints.shouldShowSubjectSection && (
            <SubjectAttributesField
              control={control}
              allowedAttributeTypes={selectableSubjectAttributeTypes}
              error={
                (formState.errors as { subjectAttributes?: { message?: string } }).subjectAttributes
                  ?.message
              }
              rowErrors={mergeRowErrors(
                rowErrorsOf(
                  (formState.errors as { subjectAttributes?: unknown }).subjectAttributes
                ),
                policyGuidance.subjectRowErrors
              )}
              rowHints={policyGuidance.subjectRowHints}
              notices={policyGuidance.subjectNotices}
            />
          )}
          {constraints.shouldShowSanSection && (
            <SubjectAltNamesField
              control={control}
              allowedSanTypes={selectableSanTypes}
              error={
                (formState.errors as { subjectAltNames?: { message?: string } }).subjectAltNames
                  ?.message
              }
              rowErrors={mergeRowErrors(
                rowErrorsOf((formState.errors as { subjectAltNames?: unknown }).subjectAltNames),
                policyGuidance.sanRowErrors
              )}
              rowHints={policyGuidance.sanRowHints}
            />
          )}
        </div>
      )}

      {currentStepKey === "options" && (
        <div className="space-y-4">
          {!isExternalTemplateProfile && (
            <Controller
              control={control}
              name="ttl"
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>
                    Validity (TTL) <span className="text-danger">*</span>
                  </FieldLabel>
                  <Input {...field} placeholder="30d, 1y, 8760h" isError={Boolean(error)} />
                  <FieldDescription>
                    The renewed certificate is valid for this long, starting now.
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </Field>
              )}
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
              <KeyUsageSection
                control={control}
                title="Key Usages"
                namePrefix="keyUsages"
                options={selectableKeyUsages}
                requiredUsages={constraints.requiredKeyUsages}
              />
              <KeyUsageSection
                control={control}
                title="Extended Key Usages"
                namePrefix="extendedKeyUsages"
                options={selectableExtendedKeyUsages}
                requiredUsages={constraints.requiredExtendedKeyUsages}
              />
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
        </div>
      )}
    </CertificateWizardSheet>
  );
};
