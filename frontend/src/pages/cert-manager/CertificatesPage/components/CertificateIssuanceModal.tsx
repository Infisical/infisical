import { useCallback, useEffect, useMemo, useRef } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { FileBadge, InfoIcon, Plus, Tags, Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  Empty,
  EmptyContent,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useGetCert } from "@app/hooks/api";
import { CaType } from "@app/hooks/api/ca";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability } from "@app/hooks/api/ca/enums";
import { useGetCertificatePolicyById } from "@app/hooks/api/certificatePolicies";
import { EnrollmentType, useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { buildExtendedKeyUsageToggleSchema } from "@app/hooks/api/certificates/constants";
import { CertificateRequestStatus, CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { useUnifiedCertificateIssuance } from "@app/hooks/api/certificates/mutations";
import { useListPkiApplicationProfiles } from "@app/hooks/api/pkiApplications";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { PkiDocsUrls } from "@app/pages/cert-manager/pki-docs-urls";
import {
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { AlgorithmSelectors } from "./AlgorithmSelectors";
import { BasicConstraintsField } from "./BasicConstraintsField";
import { buildManagedRequest } from "./buildManagedRequest";
import {
  detectSanTypeFromValue,
  EXTERNAL_CA_TEMPLATE_HINT,
  isExternalTemplateCa,
  rowErrorsOf
} from "./certificateUtils";
import { CertificateWizardSheet, useWizardSteps, WizardStep } from "./CertificateWizardSheet";
import { KeyUsageSection } from "./KeyUsageSection";
import { RequestCustomExtensionsField } from "./RequestCustomExtensionsField";
import { SubjectAltNamesField } from "./SubjectAltNamesField";
import { SubjectAttributesField } from "./SubjectAttributesField";
import { useCertificatePolicy } from "./useCertificatePolicy";
import { usePolicyGuidance } from "./usePolicyGuidance";
import { ValidityField } from "./ValidityField";

enum RequestMethod {
  MANAGED = "managed",
  CSR = "csr"
}

const subjectAttributesField = z
  .array(
    z.object({
      type: z.nativeEnum(CertSubjectAttributeType),
      value: z.string().min(1, "Value is required")
    })
  )
  .optional();

const subjectAltNamesField = z
  .array(
    z.object({
      type: z.nativeEnum(CertSubjectAlternativeNameType),
      value: z.string().min(1, "Value is required")
    })
  )
  .default([]);

const basicConstraintsField = z
  .object({
    isCA: z.boolean().default(false),
    pathLength: z.number().min(0).nullable().optional()
  })
  .optional();

const keyUsagesField = z
  .object({
    [CertKeyUsage.DIGITAL_SIGNATURE]: z.boolean().optional(),
    [CertKeyUsage.KEY_ENCIPHERMENT]: z.boolean().optional(),
    [CertKeyUsage.NON_REPUDIATION]: z.boolean().optional(),
    [CertKeyUsage.DATA_ENCIPHERMENT]: z.boolean().optional(),
    [CertKeyUsage.KEY_AGREEMENT]: z.boolean().optional(),
    [CertKeyUsage.KEY_CERT_SIGN]: z.boolean().optional(),
    [CertKeyUsage.CRL_SIGN]: z.boolean().optional(),
    [CertKeyUsage.ENCIPHER_ONLY]: z.boolean().optional(),
    [CertKeyUsage.DECIPHER_ONLY]: z.boolean().optional()
  })
  .default({});

const extendedKeyUsagesField = z
  .object({
    ...buildExtendedKeyUsageToggleSchema(z.boolean().optional())
  })
  .default({});

type CaFormVariant = "default" | "adcs" | "awsPca";

// Mirrored in backend aws-pca-certificate-authority-enums.ts; update both.
const AWS_PCA_MAX_CA_PATH_LENGTH = 3;

const buildFormSchema = (variant: CaFormVariant) => {
  const isAdcs = variant === "adcs";
  const baseSchema = z.object({
    profileId: z.string().min(1, "Profile is required"),
    ttl: isAdcs ? z.string().trim().optional() : z.string().trim().min(1, "TTL is required"),
    metadata: z
      .array(
        z.object({
          key: z.string().trim().min(1, "Key is required"),
          value: z.string().trim().default("")
        })
      )
      .optional()
  });

  const csrSchema = baseSchema.extend({
    requestMethod: z.literal(RequestMethod.CSR),
    csr: z.string().min(1, "CSR is required")
  });

  const managedSchema = baseSchema.extend({
    requestMethod: z.literal(RequestMethod.MANAGED),
    subjectAttributes: subjectAttributesField,
    subjectAltNames: subjectAltNamesField,
    basicConstraints: basicConstraintsField,
    signatureAlgorithm: isAdcs
      ? z.string().optional()
      : z.string().min(1, "Signature algorithm is required"),
    keyAlgorithm: z.string().min(1, "Key algorithm is required"),
    keyUsages: keyUsagesField,
    extendedKeyUsages: extendedKeyUsagesField,
    customExtensions: z.array(z.object({ oid: z.string(), value: z.string() })).optional()
  });

  return z
    .discriminatedUnion("requestMethod", [csrSchema, managedSchema])
    .superRefine((data, ctx) => {
      if (variant !== "awsPca" || data.requestMethod !== RequestMethod.MANAGED) return;
      if (!data.basicConstraints?.isCA) return;

      const { pathLength } = data.basicConstraints;
      if (pathLength === undefined || pathLength === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["basicConstraints", "pathLength"],
          message: `AWS Private CA requires a path length between 0 and ${AWS_PCA_MAX_CA_PATH_LENGTH} for CA certificates`
        });
        return;
      }
      if (pathLength > AWS_PCA_MAX_CA_PATH_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["basicConstraints", "pathLength"],
          message: `AWS Private CA supports a maximum path length of ${AWS_PCA_MAX_CA_PATH_LENGTH}`
        });
      }
    });
};

const strictFormSchema = buildFormSchema("default");
const adcsFormSchema = buildFormSchema("adcs");
const awsPcaFormSchema = buildFormSchema("awsPca");

export type FormData = z.infer<typeof adcsFormSchema>;

type Props = {
  popUp: UsePopUpState<["issueCertificate"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["issueCertificate"]>,
    state?: boolean
  ) => void;
  profileId?: string;
  applicationId?: string;
  applicationName?: string;
};

type IssuanceStepKey = "profile" | "csr" | "subject" | "options" | "extensions" | "metadata";

const STEP_META: Record<IssuanceStepKey, WizardStep> = {
  profile: {
    name: "Profile",
    shortDescription: "Method and profile",
    title: "Profile",
    subtitle: "Choose how to request the certificate and which profile to use.",
    rightLabel: "Profile",
    rightDescription:
      "The certificate profile determines the issuing CA and the policy that constrains what this certificate may contain. Choose Managed to have Infisical generate the key pair for you, or CSR to supply your own certificate signing request."
  },
  csr: {
    name: "Signing Request",
    shortDescription: "Provide your CSR",
    title: "Certificate Signing Request",
    subtitle: "Paste the certificate signing request to submit for signing.",
    rightLabel: "Signing Request",
    rightDescription:
      "The subject, key, and extensions are taken from your CSR. The profile's policy still validates the request at issuance."
  },
  subject: {
    name: "Subject",
    shortDescription: "Names and SANs",
    title: "Subject",
    subtitle: "Set the subject attributes and alternative names for this certificate.",
    rightLabel: "Subject",
    rightDescription:
      "Subject attributes and alternative names identify the certificate. The available fields are constrained by the profile's policy."
  },
  options: {
    name: "Options",
    shortDescription: "Validity and key usage",
    title: "Certificate Options",
    subtitle: "Set validity, algorithms, and key usages within the profile's policy.",
    rightLabel: "Options",
    rightDescription:
      "These values are validated against the profile's policy at issuance. Fields that the profile or an external CA fully controls are hidden or read-only."
  },
  extensions: {
    name: "Custom Extensions",
    shortDescription: "Extension values",
    title: "Custom Extensions",
    subtitle: "Set the custom extensions this certificate carries.",
    rightLabel: "Custom Extensions",
    rightDescription:
      "Custom extensions carry object identifiers beyond the standard ones. The profile's policy constrains which are permitted and what values they may take."
  },
  metadata: {
    name: "Metadata",
    shortDescription: "Optional key-values",
    title: "Metadata",
    subtitle: "Attach optional metadata key-value pairs to this certificate.",
    rightLabel: "Metadata",
    rightDescription:
      "Metadata is stored alongside the certificate for your own tracking and automation. It does not affect the issued certificate."
  }
};

const STEP_FIELDS: Record<IssuanceStepKey, string[]> = {
  profile: ["requestMethod", "profileId"],
  csr: ["csr", "ttl"],
  subject: ["subjectAttributes", "subjectAltNames"],
  options: [
    "ttl",
    "signatureAlgorithm",
    "keyAlgorithm",
    "keyUsages",
    "extendedKeyUsages",
    "basicConstraints"
  ],
  extensions: ["customExtensions"],
  metadata: ["metadata"]
};

export const CertificateIssuanceModal = ({
  popUp,
  handlePopUpToggle,
  profileId,
  applicationId,
  applicationName
}: Props) => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();

  const inputSerialNumber =
    (popUp?.issueCertificate?.data as { serialNumber: string })?.serialNumber || "";
  const sanitizedSerialNumber = inputSerialNumber.replace(/[^a-fA-F0-9:]/g, "");

  const { data: cert } = useGetCert(sanitizedSerialNumber);

  const { data: profilesData } = useListCertificateProfiles({
    enrollmentType: applicationId ? undefined : EnrollmentType.API,
    includeConfigs: true,
    applicationId
  });

  const { data: appProfiles } = useListPkiApplicationProfiles(applicationId ?? "");

  const profileOptions = useMemo(() => {
    const allProfiles = profilesData?.certificateProfiles ?? [];
    if (!applicationId) return allProfiles.map((profile) => ({ profile, isApiEnabled: true }));
    const apiEnabledProfileIds = new Set(
      (appProfiles ?? []).filter((p) => Boolean(p.apiConfigId)).map((p) => p.profileId)
    );
    return allProfiles
      .map((profile) => ({
        profile,
        isApiEnabled: apiEnabledProfileIds.has(profile.id)
      }))
      .sort(
        (a, b) =>
          Number(b.isApiEnabled) - Number(a.isApiEnabled) ||
          a.profile.slug.localeCompare(b.profile.slug)
      );
  }, [profilesData?.certificateProfiles, appProfiles, applicationId]);

  const availableProfiles = useMemo(
    () => profileOptions.filter((option) => option.isApiEnabled).map((option) => option.profile),
    [profileOptions]
  );

  const hasDisabledProfiles = profileOptions.some((option) => !option.isApiEnabled);

  const { mutateAsync: issueCertificate } = useUnifiedCertificateIssuance();

  const isAdcsProfileRef = useRef(false);
  const isAwsPcaProfileRef = useRef(false);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    trigger,
    clearErrors,
    formState,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: (values, context, options) => {
      let schema = strictFormSchema;
      if (isAdcsProfileRef.current) schema = adcsFormSchema;
      else if (isAwsPcaProfileRef.current) schema = awsPcaFormSchema;
      return zodResolver(schema)(values, context, options);
    },
    defaultValues: {
      requestMethod: RequestMethod.MANAGED,
      profileId: profileId || "",
      subjectAttributes: [],
      subjectAltNames: [],
      customExtensions: [],
      basicConstraints: {
        isCA: false,
        pathLength: undefined
      },
      ttl: "30d",
      signatureAlgorithm: "",
      keyAlgorithm: "",
      keyUsages: {},
      extendedKeyUsages: {}
    }
  });

  const {
    fields: metadataFields,
    append: appendMetadata,
    remove: removeMetadata
  } = useFieldArray({ control, name: "metadata" });

  const requestMethod = watch("requestMethod");

  const actualSelectedProfileId = watch("profileId");
  const watchedIsCA = watch("basicConstraints.isCA") || false;
  const actualSelectedProfile = useMemo(
    () => availableProfiles.find((p) => p.id === actualSelectedProfileId),
    [availableProfiles, actualSelectedProfileId]
  );
  const requestableCustomExtensions = useMemo(
    () => actualSelectedProfile?.defaults?.customExtensions ?? [],
    [actualSelectedProfile]
  );

  useEffect(() => {
    setValue("customExtensions", []);
  }, [actualSelectedProfileId, setValue]);

  const externalCaType = actualSelectedProfile?.certificateAuthority?.externalType;
  const isAdcsProfile = isExternalTemplateCa(externalCaType);
  const caSupportsCustomExtensions = caSupportsCapability(
    (externalCaType as CaType | undefined) ?? CaType.INTERNAL,
    CaCapability.CUSTOM_EXTENSIONS
  );
  isAdcsProfileRef.current = isAdcsProfile;

  const isAwsPcaProfile = externalCaType === CaType.AWS_PCA;
  isAwsPcaProfileRef.current = isAwsPcaProfile;

  const digicertProductNameId =
    externalCaType === CaType.DIGICERT
      ? actualSelectedProfile?.certificateAuthority?.productNameId
      : undefined;

  const { data: policyData } = useGetCertificatePolicyById({
    policyId: actualSelectedProfile?.certificatePolicyId || "",
    applicationId
  });

  const {
    constraints,
    filteredKeyUsages,
    filteredExtendedKeyUsages,
    availableSignatureAlgorithms,
    availableKeyAlgorithms,
    resetConstraints
  } = useCertificatePolicy(
    policyData,
    actualSelectedProfile,
    popUp?.issueCertificate?.isOpen || false,
    setValue,
    watch
  );

  const policy = usePolicyGuidance({
    policy: policyData,
    watch,
    clearErrors,
    isSubjectSectionShown: constraints.shouldShowSubjectSection,
    isSanSectionShown: constraints.shouldShowSanSection,
    customExtensionDeclarations: requestableCustomExtensions,
    isSubjectEvaluated: requestMethod === RequestMethod.MANAGED,
    isValidityEvaluated: !isAdcsProfile,
    resetKey: actualSelectedProfileId
  });

  const resetAllState = useCallback(() => {
    resetConstraints();
    reset();
  }, [reset, resetConstraints]);

  const stepKeys = useMemo<IssuanceStepKey[]>(() => {
    const keys: IssuanceStepKey[] = ["profile"];
    if (requestMethod === RequestMethod.CSR) {
      keys.push("csr");
    } else {
      if (constraints.shouldShowSubjectSection || constraints.shouldShowSanSection) {
        keys.push("subject");
      }
      keys.push("options");
      if (policyData?.customExtensions?.length !== 0 && caSupportsCustomExtensions) {
        keys.push("extensions");
      }
    }
    keys.push("metadata");
    return keys;
  }, [
    requestMethod,
    constraints.shouldShowSubjectSection,
    constraints.shouldShowSanSection,
    policyData?.customExtensions?.length,
    caSupportsCustomExtensions
  ]);

  const { step, setStep, currentStepKey, goBack, goNext, onFormInvalid } = useWizardSteps({
    stepKeys,
    stepFields: STEP_FIELDS,
    invalidMessage: "Please fix the highlighted fields before requesting.",
    validateStep: async (fields) => {
      // Leaving a step reveals the findings on its own fields; entering it must stay quiet.
      policy.reveal(fields);
      if (!(await trigger(fields as (keyof FormData)[]))) return false;
      return policy.findBlockedFields(fields).length === 0;
    }
  });

  const steps = useMemo(() => stepKeys.map((key) => STEP_META[key]), [stepKeys]);

  useEffect(() => {
    if (cert) {
      const subjectAttrs: Array<{ type: CertSubjectAttributeType; value: string }> = [];
      if (cert.commonName)
        subjectAttrs.push({ type: CertSubjectAttributeType.COMMON_NAME, value: cert.commonName });

      reset({
        requestMethod: RequestMethod.MANAGED,
        profileId: "",
        subjectAttributes:
          subjectAttrs.length > 0
            ? subjectAttrs
            : [{ type: CertSubjectAttributeType.COMMON_NAME, value: "" }],
        subjectAltNames: cert.subjectAltNames
          ? cert.subjectAltNames.split(",").map((name) => {
              const trimmed = name.trim();
              return { type: detectSanTypeFromValue(trimmed), value: trimmed };
            })
          : [],
        ttl: "",
        signatureAlgorithm: "",
        keyAlgorithm: "",
        keyUsages: Object.fromEntries((cert.keyUsages || []).map((name) => [name, true])),
        extendedKeyUsages: Object.fromEntries(
          (cert.extendedKeyUsages || []).map((name) => [name, true])
        )
      });
    }
  }, [cert, reset]);

  useEffect(() => {
    if (popUp?.issueCertificate?.isOpen && profileId && !cert) {
      setValue("profileId", profileId);
    }
  }, [popUp?.issueCertificate?.isOpen, profileId, cert, setValue]);

  useEffect(() => {
    if (popUp?.issueCertificate?.isOpen) {
      setStep(0);
    }
  }, [popUp?.issueCertificate?.isOpen]);

  const onFormSubmit = useCallback(
    async (formData: FormData) => {
      if (!currentProject?.slug || !currentProject?.id) {
        createNotification({
          text: "Project not found. Please refresh and try again.",
          type: "error"
        });
        return;
      }

      const { profileId: formProfileId, ttl } = formData;

      if (!formProfileId) {
        createNotification({
          text: "Please select a certificate profile.",
          type: "error"
        });
        return;
      }

      // Reachable when a step was skipped or its values changed after it was cleared. Reveal the
      // whole offending step, so the finding is visible wherever in it the requester lands.
      const [blockedField] = policy.findBlockedFields(stepKeys.flatMap((key) => STEP_FIELDS[key]));
      if (blockedField) {
        const blockedStep = stepKeys.findIndex((key) => STEP_FIELDS[key].includes(blockedField));
        policy.reveal(blockedStep >= 0 ? STEP_FIELDS[stepKeys[blockedStep]] : [blockedField]);
        if (blockedStep >= 0) setStep(blockedStep);
        createNotification({
          text: "Resolve the policy violations before requesting this certificate.",
          type: "error"
        });
        return;
      }

      const handleIssuanceResponse = (response: Awaited<ReturnType<typeof issueCertificate>>) => {
        if ("certificate" in response && response.certificate) {
          createNotification({ text: "Successfully created certificate", type: "success" });
          resetAllState();
          handlePopUpToggle("issueCertificate", false);
          if (currentOrg?.id && currentProject?.id && response.certificate.certificateId) {
            navigate({
              to: "/organizations/$orgId/projects/cert-manager/$projectId/certificates/$certificateId",
              params: {
                orgId: currentOrg.id,
                projectId: currentProject.id,
                certificateId: response.certificate.certificateId
              },
              ...(applicationName && { search: { fromApplication: applicationName } })
            });
          }
        } else if (
          "status" in response &&
          response.status === CertificateRequestStatus.PENDING_APPROVAL
        ) {
          createNotification({
            text: "Certificate request submitted successfully. Approval is required before the certificate can be issued.",
            type: "success"
          });
          resetAllState();
          handlePopUpToggle("issueCertificate", false);
        } else {
          createNotification({
            text: `Certificate request submitted successfully. This may take a few minutes to process. Certificate Request ID: ${response.certificateRequestId}`,
            type: "success"
          });
          resetAllState();
          handlePopUpToggle("issueCertificate", false);
        }
      };

      try {
        if (formData.requestMethod === RequestMethod.CSR) {
          const metadataEntries = formData.metadata?.filter((m) => m.key);
          const response = await issueCertificate({
            profileId: formProfileId,
            ...(applicationId && { applicationId }),
            csr: formData.csr,
            attributes: isAdcsProfile ? {} : { ttl },
            ...(metadataEntries?.length && { metadata: metadataEntries })
          });

          handleIssuanceResponse(response);
          return;
        }

        const request = buildManagedRequest({
          formData,
          applicationId,
          isAdcsProfile,
          constraints,
          defaults: actualSelectedProfile?.defaults
        });

        const response = await issueCertificate(request);
        handleIssuanceResponse(response);
      } catch (error) {
        createNotification({
          text: `Failed to request certificate: ${(error as Error)?.message || "Unknown error"}`,
          type: "error"
        });
      }
    },
    [
      currentProject?.slug,
      currentProject?.id,
      currentOrg?.id,
      issueCertificate,
      constraints,
      actualSelectedProfile?.defaults,
      applicationId,
      applicationName,
      isAdcsProfile,
      handlePopUpToggle,
      navigate,
      resetAllState,
      stepKeys,
      setStep
    ]
  );

  const selectedProfileReady = Boolean(profileId || actualSelectedProfileId);

  return (
    <CertificateWizardSheet
      isOpen={Boolean(popUp?.issueCertificate?.isOpen)}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("issueCertificate", isOpen);
        if (!isOpen) {
          resetAllState();
        }
      }}
      icon={<FileBadge className="h-5 w-5" />}
      title={cert ? "Certificate Details" : "Request New Certificate"}
      description={
        cert
          ? "View certificate information"
          : "Request a new certificate using a certificate profile"
      }
      steps={steps}
      activeStep={step}
      onStepChange={setStep}
      docsHref={PkiDocsUrls.applications.certificates}
      submitLabel="Request Certificate"
      onSubmit={handleSubmit(onFormSubmit, onFormInvalid)}
      onBack={goBack}
      onContinue={goNext}
      isSubmitting={isSubmitting}
      isSubmitDisabled={!actualSelectedProfile && !profileId}
      isContinueDisabled={currentStepKey === "profile" && !selectedProfileReady}
      overrideContent={
        cert ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <h4 className="text-sm font-medium text-foreground">Certificate Details</h4>
            <p className="mt-1 text-sm text-muted">Serial Number: {cert.serialNumber}</p>
            <p className="text-sm text-muted">Certificate Id: {cert.id}</p>
            <p className="text-sm text-muted">Common Name: {cert.commonName}</p>
            <p className="text-sm text-muted">Status: {cert.status}</p>
          </div>
        ) : undefined
      }
    >
      {currentStepKey === "profile" && (
        <div className="space-y-5">
          <Controller
            control={control}
            name="requestMethod"
            render={({ field: { onChange, value } }) => (
              <Field>
                <FieldLabel>Request Method</FieldLabel>
                <FieldContent>
                  <Select value={value} onValueChange={(val) => onChange(val as RequestMethod)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value={RequestMethod.MANAGED}>Managed</SelectItem>
                      <SelectItem value={RequestMethod.CSR}>
                        Certificate Signing Request (CSR)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Managed generates and manages the private key for you. CSR lets you provide your
                    own certificate signing request when you need to manage your own private key.
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          />

          {!profileId && (
            <Controller
              control={control}
              name="profileId"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    Certificate Profile <span className="text-danger">*</span>
                  </FieldLabel>
                  <FieldContent>
                    <Select value={value || ""} onValueChange={(val) => onChange(val)}>
                      <SelectTrigger className="w-full" isError={Boolean(error)}>
                        <SelectValue placeholder="Select a certificate profile" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {profileOptions.length === 0 && applicationId ? (
                          <div className="px-3 py-3 text-xs leading-snug whitespace-normal text-muted">
                            No certificate profiles are attached to this Application. Add one under
                            this Application&apos;s Settings tab.
                          </div>
                        ) : (
                          profileOptions.map(({ profile, isApiEnabled }) => (
                            <SelectItem
                              key={profile.id}
                              value={profile.id}
                              disabled={!isApiEnabled}
                              description={
                                isApiEnabled ? undefined : "API enrollment not configured"
                              }
                            >
                              {profile.slug}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {hasDisabledProfiles && (
                      <FieldDescription>
                        Profiles without API enrollment configured can&apos;t be used here.
                        Configure API enrollment under this Application&apos;s Settings tab.
                      </FieldDescription>
                    )}
                    {isAdcsProfile && (
                      <FieldDescription>{EXTERNAL_CA_TEMPLATE_HINT}</FieldDescription>
                    )}
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          )}
        </div>
      )}

      {currentStepKey !== "profile" && (actualSelectedProfile || profileId) && (
        <div className="space-y-4">
          {currentStepKey === "options" && profileId && isAdcsProfile && (
            <p className="mb-4 text-xs text-mineshaft-400">{EXTERNAL_CA_TEMPLATE_HINT}</p>
          )}

          {(currentStepKey === "subject" || currentStepKey === "csr") && digicertProductNameId && (
            <Alert variant="info" className="mb-4">
              <InfoIcon />
              <AlertDescription>
                <p>
                  This profile orders through the DigiCert{" "}
                  <span className="font-mono">{digicertProductNameId}</span> product, which rejects
                  unsupported subject values when the order is placed.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {currentStepKey === "csr" && (
            <Controller
              control={control}
              name="csr"
              render={({ field: { value, ...field }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>
                    Certificate Signing Request (CSR) <span className="text-danger">*</span>
                  </FieldLabel>
                  <TextArea
                    {...field}
                    value={value ?? ""}
                    spellCheck={false}
                    isError={Boolean(error)}
                    placeholder={
                      "-----BEGIN CERTIFICATE REQUEST-----\n" +
                      "MIIByDCCAU4CAQAwfjELMAkGA1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWEx\n" +
                      "FjAUBgNVBAcMDVNhbiBGcmFuY2lzY28xEjAQBgNVBAoMCURlbW8gQ29ycDEUMBIG\n" +
                      "A1UECwwLRW5naW5lZXJpbmcxGDAWBgNVBAMMD2FwcC5leGFtcGxlLmNvbTB2MBAG\n" +
                      "ByqGSM49AgEGBSuBBAAiA2IABDHV5yengUugeBcpjsw+iAaxSkCr16LMr3ITyvlM\n" +
                      "lDv+AE0Ddc6FsFXJicBfTalM3AKl5F14OCBRfI2jugWJOGCLcKYqRDTDevxQmgCI\n" +
                      "IfpRM6+jzPkqe0PsuLhYiRfbFKBRME8GCSqGSIb3DQEJDjFCMEAwPgYDVR0RBDcw\n" +
                      "NYIPYXBwLmV4YW1wbGUuY29tghEqLmFwcC5leGFtcGxlLmNvbYIJbG9jYWxob3N0\n" +
                      "hwR/AAABMAoGCCqGSM49BAMCA2gAMGUCMGQQYs4lTSc3r/5MlabDx4m+sWaAtDhO\n" +
                      "17c3TaoDZOMG6r45mgUskPGTripXV9ItTQIxAJypXNlHnMvks7MO4LmicPqku4MF\n" +
                      "IeFqqXMFzC9uAO3iQ8/ji6ukvT6a9A3DE9LLIg==\n" +
                      "-----END CERTIFICATE REQUEST-----"
                    }
                    rows={13}
                    className="w-full font-mono text-xs"
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          )}

          {currentStepKey === "subject" && constraints.shouldShowSubjectSection && (
            <SubjectAttributesField
              control={control}
              allowedAttributeTypes={constraints.allowedSubjectAttributeTypes}
              error={
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

          {currentStepKey === "subject" && constraints.shouldShowSanSection && (
            <SubjectAltNamesField
              control={control}
              allowedSanTypes={constraints.allowedSanTypes}
              error={
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

          {(currentStepKey === "csr" || currentStepKey === "options") && !isAdcsProfile && (
            <ValidityField
              control={control}
              className="mb-4"
              label="Time to Live (TTL)"
              hint={policy.ttlHint}
              policyError={policy.ttlError}
              revealPolicyError={policy.isRevealed("ttl")}
            />
          )}

          {currentStepKey === "options" && (
            <>
              <AlgorithmSelectors
                control={control}
                availableSignatureAlgorithms={availableSignatureAlgorithms}
                availableKeyAlgorithms={availableKeyAlgorithms}
                caKeyAlgorithm={actualSelectedProfile?.certificateAuthority?.keyAlgorithm}
                hideSignatureAlgorithm={isAdcsProfile}
                signatureError={
                  (formState.errors as { signatureAlgorithm?: { message?: string } })
                    .signatureAlgorithm?.message
                }
                keyError={
                  (formState.errors as { keyAlgorithm?: { message?: string } }).keyAlgorithm
                    ?.message
                }
              />

              {!isAdcsProfile && (
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
                      maxPathLength={isAwsPcaProfile ? AWS_PCA_MAX_CA_PATH_LENGTH : undefined}
                      isPathLengthRequired={
                        isAwsPcaProfile ||
                        (typeof constraints.maxPathLength === "number" &&
                          constraints.maxPathLength !== -1)
                      }
                      idPrefix="issuance"
                    />
                  )}
                </div>
              )}
            </>
          )}

          {currentStepKey === "extensions" && (
            <RequestCustomExtensionsField
              control={control}
              declarations={requestableCustomExtensions}
              policyRules={policyData?.customExtensions}
              errorsByOid={policy.customExtensions.errorsByOid}
              revealPolicyErrors={policy.isRevealed("customExtensions")}
            />
          )}

          {currentStepKey === "metadata" && (
            <div>
              <p className="text-sm font-medium text-foreground">Metadata</p>
              {metadataFields.length === 0 ? (
                <Empty className="mt-3 border py-8">
                  <EmptyMedia variant="icon">
                    <Tags />
                  </EmptyMedia>
                  <EmptyTitle>No metadata added</EmptyTitle>
                  <EmptyContent>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendMetadata({ key: "", value: "" })}
                    >
                      <Plus className="size-4" /> Add entry
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : (
                <div className="mt-3 space-y-2">
                  {metadataFields.map((metaField, index) => (
                    <div key={metaField.id} className="flex items-start gap-2">
                      <Controller
                        control={control}
                        name={`metadata.${index}.key`}
                        render={({ field, fieldState: { error } }) => (
                          <Input
                            {...field}
                            placeholder="Key"
                            className="flex-1"
                            isError={Boolean(error)}
                          />
                        )}
                      />
                      <Controller
                        control={control}
                        name={`metadata.${index}.value`}
                        render={({ field }) => (
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Value (optional)"
                            className="flex-1"
                          />
                        )}
                      />
                      <IconButton
                        type="button"
                        variant="ghost"
                        aria-label="Remove metadata entry"
                        onClick={() => removeMetadata(index)}
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendMetadata({ key: "", value: "" })}
                  >
                    <Plus className="size-4" /> Add entry
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </CertificateWizardSheet>
  );
};
