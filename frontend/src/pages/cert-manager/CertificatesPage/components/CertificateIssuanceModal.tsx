import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { FileBadge, Plus, Tags, Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  DocumentationLinkBadge,
  Empty,
  EmptyContent,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep,
  TextArea
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { isIPv4, isIPv6 } from "@app/helpers/ip";
import { useGetCert } from "@app/hooks/api";
import { CaType } from "@app/hooks/api/ca";
import { useGetCertificatePolicyById } from "@app/hooks/api/certificatePolicies";
import { EnrollmentType, useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import {
  CertExtendedKeyUsage,
  CertificateRequestStatus,
  CertKeyUsage
} from "@app/hooks/api/certificates/enums";
import { useUnifiedCertificateIssuance } from "@app/hooks/api/certificates/mutations";
import { useListPkiApplicationProfiles } from "@app/hooks/api/pkiApplications";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { PkiDocsUrls } from "@app/pages/cert-manager/pki-docs-urls";
import {
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { AlgorithmSelectors } from "./AlgorithmSelectors";
import { buildManagedRequest } from "./buildManagedRequest";
import { KeyUsageSection } from "./KeyUsageSection";
import { SubjectAltNamesField } from "./SubjectAltNamesField";
import { SubjectAttributesField } from "./SubjectAttributesField";
import { useCertificatePolicy } from "./useCertificatePolicy";

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
    [CertExtendedKeyUsage.CLIENT_AUTH]: z.boolean().optional(),
    [CertExtendedKeyUsage.CODE_SIGNING]: z.boolean().optional(),
    [CertExtendedKeyUsage.EMAIL_PROTECTION]: z.boolean().optional(),
    [CertExtendedKeyUsage.OCSP_SIGNING]: z.boolean().optional(),
    [CertExtendedKeyUsage.SERVER_AUTH]: z.boolean().optional(),
    [CertExtendedKeyUsage.TIMESTAMPING]: z.boolean().optional()
  })
  .default({});

const buildFormSchema = (isAdcs: boolean) => {
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
    extendedKeyUsages: extendedKeyUsagesField
  });

  return z.discriminatedUnion("requestMethod", [csrSchema, managedSchema]);
};

const strictFormSchema = buildFormSchema(false);
const adcsFormSchema = buildFormSchema(true);

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

type IssuanceStepKey = "profile" | "csr" | "subject" | "options" | "metadata";

const STEP_META: Record<
  IssuanceStepKey,
  {
    name: string;
    shortDescription: string;
    title: string;
    subtitle: string;
    rightLabel: string;
    rightDescription: string;
  }
> = {
  profile: {
    name: "Profile",
    shortDescription: "Method and profile",
    title: "Profile",
    subtitle: "Choose how to request the certificate and which profile to use.",
    rightLabel: "PROFILE",
    rightDescription:
      "The certificate profile determines the issuing CA and the policy that constrains what this certificate may contain. Choose Managed to have Infisical generate the key pair for you, or CSR to supply your own certificate signing request."
  },
  csr: {
    name: "Signing Request",
    shortDescription: "Provide your CSR",
    title: "Certificate Signing Request",
    subtitle: "Paste the certificate signing request to submit for signing.",
    rightLabel: "SIGNING REQUEST",
    rightDescription:
      "The subject, key, and extensions are taken from your CSR. The profile's policy still validates the request at issuance."
  },
  subject: {
    name: "Subject",
    shortDescription: "Names and SANs",
    title: "Subject",
    subtitle: "Set the subject attributes and alternative names for this certificate.",
    rightLabel: "SUBJECT",
    rightDescription:
      "Subject attributes and alternative names identify the certificate. The available fields are constrained by the profile's policy."
  },
  options: {
    name: "Options",
    shortDescription: "Validity and key usage",
    title: "Certificate Options",
    subtitle: "Set validity, algorithms, and key usages within the profile's policy.",
    rightLabel: "OPTIONS",
    rightDescription:
      "These values are validated against the profile's policy at issuance. Fields that the profile or an external CA fully controls are hidden or read-only."
  },
  metadata: {
    name: "Metadata",
    shortDescription: "Optional key-values",
    title: "Metadata",
    subtitle: "Attach optional metadata key-value pairs to this certificate.",
    rightLabel: "METADATA",
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

  const [step, setStep] = useState(0);

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

  const availableProfiles = useMemo(() => {
    const allProfiles = profilesData?.certificateProfiles ?? [];
    if (!applicationId) return allProfiles;
    const apiEnabledProfileIds = new Set(
      (appProfiles ?? []).filter((p) => Boolean(p.apiConfigId)).map((p) => p.profileId)
    );
    return allProfiles.filter((p) => apiEnabledProfileIds.has(p.id));
  }, [profilesData?.certificateProfiles, appProfiles, applicationId]);

  const { mutateAsync: issueCertificate } = useUnifiedCertificateIssuance();

  const isAdcsProfileRef = useRef(false);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: (values, context, options) =>
      zodResolver(isAdcsProfileRef.current ? adcsFormSchema : strictFormSchema)(
        values,
        context,
        options
      ),
    defaultValues: {
      requestMethod: RequestMethod.MANAGED,
      profileId: profileId || "",
      subjectAttributes: [],
      subjectAltNames: [],
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

  const externalCaType = actualSelectedProfile?.certificateAuthority?.externalType;
  const isAdcsProfile = externalCaType === CaType.ADCS || externalCaType === CaType.AZURE_AD_CS;
  isAdcsProfileRef.current = isAdcsProfile;

  const externalCaHint =
    "Validity, key usages, extended key usages and basic constraints are controlled by the external CA's certificate template.";

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
    }
    keys.push("metadata");
    return keys;
  }, [requestMethod, constraints.shouldShowSubjectSection, constraints.shouldShowSanSection]);

  const currentStepKey = stepKeys[Math.min(step, stepKeys.length - 1)];
  const currentStepMeta = STEP_META[currentStepKey];
  const isLastStep = step === stepKeys.length - 1;

  useEffect(() => {
    if (step > stepKeys.length - 1) setStep(stepKeys.length - 1);
  }, [stepKeys.length, step]);

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
              if (trimmed.includes("@"))
                return { type: CertSubjectAlternativeNameType.EMAIL, value: trimmed };
              if (isIPv4(trimmed) || isIPv6(trimmed))
                return { type: CertSubjectAlternativeNameType.IP_ADDRESS, value: trimmed };
              if (trimmed.startsWith("http"))
                return { type: CertSubjectAlternativeNameType.URI, value: trimmed };
              return { type: CertSubjectAlternativeNameType.DNS_NAME, value: trimmed };
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
    if (popUp?.issueCertificate?.isOpen) setStep(0);
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
      resetAllState
    ]
  );

  const getModalTitle = () => {
    if (cert) return "Certificate Details";
    return "Request New Certificate";
  };

  const getModalSubTitle = () => {
    if (cert) return "View certificate information";
    return "Request a new certificate using a certificate profile";
  };

  const selectedProfileReady = Boolean(profileId || actualSelectedProfileId);

  const goBack = () => setStep((s) => Math.max(0, s - 1));
  const goNext = () => {
    if (currentStepKey === "profile" && !selectedProfileReady) return;
    setStep((s) => Math.min(stepKeys.length - 1, s + 1));
  };

  const onFormInvalid = (errors: Record<string, unknown>) => {
    const errorKeys = Object.keys(errors);
    const idx = stepKeys.findIndex((key) =>
      STEP_FIELDS[key].some((fieldName) => errorKeys.includes(fieldName))
    );
    if (idx >= 0) setStep(idx);
    createNotification({
      text: "Please fix the highlighted fields before requesting.",
      type: "error"
    });
  };

  return (
    <Sheet
      open={popUp?.issueCertificate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("issueCertificate", isOpen);
        if (!isOpen) {
          resetAllState();
        }
      }}
    >
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 p-0 sm:max-w-[1100px]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>
            <div className="flex w-full items-start gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-project/10 text-project">
                <FileBadge className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-x-2 text-foreground">{getModalTitle()}</div>
                <p className="text-sm leading-4 text-muted">{getModalSubTitle()}</p>
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        {cert ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <h4 className="text-sm font-medium text-foreground">Certificate Details</h4>
            <p className="mt-1 text-sm text-muted">Serial Number: {cert.serialNumber}</p>
            <p className="text-sm text-muted">Certificate Id: {cert.id}</p>
            <p className="text-sm text-muted">Common Name: {cert.commonName}</p>
            <p className="text-sm text-muted">Status: {cert.status}</p>
          </div>
        ) : (
          <form onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
                <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
                  Setup steps
                </p>
                <Stepper
                  activeStep={step}
                  orientation="vertical"
                  onStepChange={(i) => {
                    if (isSubmitting) return;
                    if (i < step) setStep(i);
                  }}
                >
                  <StepperList>
                    {stepKeys.map((key, i) => (
                      <StepperStep
                        key={key}
                        index={i}
                        title={STEP_META[key].name}
                        description={STEP_META[key].shortDescription}
                      />
                    ))}
                  </StepperList>
                </Stepper>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-foreground">{currentStepMeta.title}</h2>
                  <p className="mt-1 text-sm text-muted">{currentStepMeta.subtitle}</p>
                </div>

                {currentStepKey === "profile" && (
                  <div className="space-y-5">
                    <Controller
                      control={control}
                      name="requestMethod"
                      render={({ field: { onChange, value } }) => (
                        <Field>
                          <FieldLabel>Request Method</FieldLabel>
                          <FieldContent>
                            <Select
                              value={value}
                              onValueChange={(val) => onChange(val as RequestMethod)}
                            >
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
                              Managed generates and manages the private key for you. CSR lets you
                              provide your own certificate signing request when you need to manage
                              your own private key.
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
                                  {availableProfiles.length === 0 && applicationId ? (
                                    <div className="px-3 py-3 text-xs leading-snug whitespace-normal text-muted">
                                      Only profiles with API enrollment configured on this
                                      Application are listed here. Configure API enrollment under
                                      this Application&apos;s Settings tab.
                                    </div>
                                  ) : (
                                    availableProfiles.map((profile) => (
                                      <SelectItem key={profile.id} value={profile.id}>
                                        {profile.slug}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              {isAdcsProfile && (
                                <FieldDescription>{externalCaHint}</FieldDescription>
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
                      <p className="mb-4 text-xs text-mineshaft-400">{externalCaHint}</p>
                    )}

                    {currentStepKey === "csr" && (
                      <Controller
                        control={control}
                        name="csr"
                        render={({ field: { value, ...field }, fieldState: { error } }) => (
                          <Field className="mb-4">
                            <FieldLabel>
                              Certificate Signing Request (CSR){" "}
                              <span className="text-danger">*</span>
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
                          (formState.errors as { subjectAttributes?: { message?: string } })
                            .subjectAttributes?.message
                        }
                      />
                    )}

                    {currentStepKey === "subject" && constraints.shouldShowSanSection && (
                      <SubjectAltNamesField
                        control={control}
                        allowedSanTypes={constraints.allowedSanTypes}
                        error={
                          (formState.errors as { subjectAltNames?: { message?: string } })
                            .subjectAltNames?.message
                        }
                      />
                    )}

                    {(currentStepKey === "csr" || currentStepKey === "options") &&
                      !isAdcsProfile && (
                        <Controller
                          control={control}
                          name="ttl"
                          render={({ field, fieldState: { error } }) => (
                            <Field className="mb-4">
                              <FieldLabel>
                                Time to Live (TTL) <span className="text-danger">*</span>
                              </FieldLabel>
                              <Input
                                {...field}
                                placeholder="30d, 1y, 8760h"
                                isError={Boolean(error)}
                              />
                              <FieldError errors={[error]} />
                            </Field>
                          )}
                        />
                      )}

                    {currentStepKey === "options" && (
                      <>
                        <AlgorithmSelectors
                          control={control}
                          availableSignatureAlgorithms={availableSignatureAlgorithms}
                          availableKeyAlgorithms={availableKeyAlgorithms}
                          hideSignatureAlgorithm={isAdcsProfile}
                          signatureError={
                            (formState.errors as { signatureAlgorithm?: { message?: string } })
                              .signatureAlgorithm?.message
                          }
                          keyError={
                            (formState.errors as { keyAlgorithm?: { message?: string } })
                              .keyAlgorithm?.message
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
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  Basic Constraints
                                </p>
                                <div className="mt-4 space-y-4">
                                  <Controller
                                    control={control}
                                    name="basicConstraints.isCA"
                                    render={({ field: { value, onChange } }) => (
                                      <div className="flex items-start gap-3">
                                        <Checkbox
                                          id="isCA"
                                          variant="project"
                                          isChecked={
                                            constraints.templateRequiresCA || value || false
                                          }
                                          isDisabled={constraints.templateRequiresCA}
                                          onCheckedChange={(checked) => {
                                            if (!constraints.templateRequiresCA) {
                                              onChange(checked);
                                              if (!checked) {
                                                setValue("basicConstraints.pathLength", null);
                                              }
                                            }
                                          }}
                                        />
                                        <span className="text-sm text-foreground">
                                          Issue as Certificate Authority
                                          <span className="mt-1 block text-xs text-muted">
                                            This certificate will be issued with the CA:TRUE
                                            extension.
                                          </span>
                                        </span>
                                      </div>
                                    )}
                                  />

                                  {watchedIsCA && (
                                    <Controller
                                      control={control}
                                      name="basicConstraints.pathLength"
                                      render={({ field, fieldState: { error } }) => {
                                        const isPathLengthRequired =
                                          typeof constraints.maxPathLength === "number" &&
                                          constraints.maxPathLength !== -1;
                                        return (
                                          <Field>
                                            <FieldLabel>
                                              Path Length{" "}
                                              {isPathLengthRequired && (
                                                <span className="text-danger">*</span>
                                              )}
                                            </FieldLabel>
                                            <Input
                                              {...field}
                                              type="number"
                                              min={0}
                                              isError={Boolean(error)}
                                              placeholder={
                                                isPathLengthRequired
                                                  ? "Enter path length (required)"
                                                  : "Leave empty for no constraint"
                                              }
                                              value={field.value ?? ""}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === "") {
                                                  field.onChange(null);
                                                } else {
                                                  const numVal = parseInt(val, 10);
                                                  field.onChange(
                                                    Number.isNaN(numVal) ? null : numVal
                                                  );
                                                }
                                              }}
                                            />
                                            <FieldDescription>
                                              Sets the pathLen for this CA certificate. Controls how
                                              many levels of sub-CAs can exist below. Empty means
                                              unlimited; 0 means it can only sign end-entity
                                              certificates.
                                            </FieldDescription>
                                            <FieldError errors={[error]} />
                                          </Field>
                                        );
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
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
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  aria-label="Remove metadata entry"
                                  onClick={() => removeMetadata(index)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
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
              </div>

              <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
                <div className="mb-auto">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                      Step {step + 1} · {currentStepMeta.rightLabel}
                    </p>
                    <DocumentationLinkBadge href={PkiDocsUrls.applications.certificates} />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {currentStepMeta.rightDescription}
                  </p>
                </div>
              </aside>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
              <span className="text-xs text-muted" />
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  Step {step + 1} of {stepKeys.length}
                </span>
                {step > 0 && (
                  <Button type="button" variant="outline" onClick={goBack}>
                    Back
                  </Button>
                )}
                {isLastStep ? (
                  <Button
                    type="button"
                    variant="project"
                    isPending={isSubmitting}
                    isDisabled={isSubmitting || (!actualSelectedProfile && !profileId)}
                    onClick={handleSubmit(onFormSubmit, onFormInvalid)}
                  >
                    Request Certificate
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="project"
                    isDisabled={!selectedProfileReady}
                    onClick={goNext}
                  >
                    Continue
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
};
