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
import { buildRenewalFormDefaults, buildRenewalRequestAttributes } from "./certificateRenewalUtils";
import { CertificateWizardSheet, useWizardSteps, WizardStep } from "./CertificateWizardSheet";
import { KeyUsageSection } from "./KeyUsageSection";
import { SubjectAltNamesField } from "./SubjectAltNamesField";
import { SubjectAttributesField } from "./SubjectAttributesField";
import {
  DEFAULT_TEMPLATE_CONSTRAINTS,
  deriveTemplateConstraints,
  useCertificatePolicyOptions
} from "./useCertificatePolicy";

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
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["renewCertificate"]>,
    state?: boolean
  ) => void;
};

export const CertificateRenewalModal = ({ popUp, handlePopUpToggle }: Props) => {
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
    formState,
    formState: { isSubmitting }
  } = useForm<RenewalFormData>({
    resolver: zodResolver(formSchema),
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

  const { step, setStep, currentStepKey, goBack, goNext, onFormInvalid } = useWizardSteps({
    stepKeys,
    stepFields: STEP_FIELDS,
    invalidMessage: "Please fix the highlighted fields before renewing."
  });

  const steps = useMemo(() => stepKeys.map((key) => STEP_META[key]), [stepKeys]);

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

    const result = await renewCertificate({
      certificateId,
      renewalKeySource: formData.keySource,
      ...(formData.keySource === CertificateRenewalKeySource.Csr && { csr: formData.csr }),
      attributes: buildRenewalRequestAttributes({ formData, constraints })
    });

    createNotification({
      text: result.certificateId
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
        }
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
          {constraints.shouldShowSubjectSection && (
            <SubjectAttributesField
              control={control}
              allowedAttributeTypes={selectableSubjectAttributeTypes}
              error={
                (formState.errors as { subjectAttributes?: { message?: string } }).subjectAttributes
                  ?.message
              }
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
            />
          )}
        </div>
      )}

      {currentStepKey === "options" && (
        <div className="space-y-4">
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

          <AlgorithmSelectors
            control={control}
            availableSignatureAlgorithms={availableSignatureAlgorithms}
            availableKeyAlgorithms={availableKeyAlgorithms}
            keyAlgorithmDisabledReason={
              keySource === CertificateRenewalKeySource.Reuse
                ? "The key algorithm is fixed while the existing key pair is reused."
                : undefined
            }
          />

          <div className="mt-4 space-y-6">
            <KeyUsageSection
              control={control}
              title="Key Usages"
              namePrefix="keyUsages"
              options={filteredKeyUsages}
              requiredUsages={constraints.requiredKeyUsages}
            />
            <KeyUsageSection
              control={control}
              title="Extended Key Usages"
              namePrefix="extendedKeyUsages"
              options={filteredExtendedKeyUsages}
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
        </div>
      )}
    </CertificateWizardSheet>
  );
};
