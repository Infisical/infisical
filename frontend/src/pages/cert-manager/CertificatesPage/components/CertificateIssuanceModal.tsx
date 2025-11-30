import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
import { useProject } from "@app/context";
import { useGetCert } from "@app/hooks/api";
import { EnrollmentType, useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { useUnifiedCertificateIssuance } from "@app/hooks/api/certificates/mutations";
import { useGetCertificateTemplateV2ById } from "@app/hooks/api/certificateTemplates/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { CertSubjectAlternativeNameType } from "@app/pages/cert-manager/PoliciesPage/components/CertificateTemplatesV2Tab/shared/certificate-constants";

import { AlgorithmSelectors } from "./AlgorithmSelectors";
import { CertificateContent } from "./CertificateContent";
import { filterUsages, formatSubjectAltNames, getAttributeValue } from "./certificateUtils";
import { KeyUsageSection } from "./KeyUsageSection";
import { SubjectAltNamesField } from "./SubjectAltNamesField";
import { useCertificateTemplate } from "./useCertificateTemplate";

const createSchema = (shouldShowSubjectSection: boolean) => {
  return z.object({
    profileId: z.string().min(1, "Profile is required"),
    subjectAttributes: shouldShowSubjectSection
      ? z
          .array(
            z.object({
              type: z.enum(["common_name"]),
              value: z.string().min(1, "Value is required")
            })
          )
          .min(1, "At least one subject attribute is required")
      : z
          .array(
            z.object({
              type: z.enum(["common_name"]),
              value: z.string().min(1, "Value is required")
            })
          )
          .optional(),
    subjectAltNames: z
      .array(
        z.object({
          type: z.nativeEnum(CertSubjectAlternativeNameType),
          value: z.string().min(1, "Value is required")
        })
      )
      .default([]),
    ttl: z.string().trim().min(1, "TTL is required"),
    signatureAlgorithm: z.string().min(1, "Signature algorithm is required"),
    keyAlgorithm: z.string().min(1, "Key algorithm is required"),
    keyUsages: z
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
      .default({}),
    extendedKeyUsages: z
      .object({
        [CertExtendedKeyUsage.CLIENT_AUTH]: z.boolean().optional(),
        [CertExtendedKeyUsage.CODE_SIGNING]: z.boolean().optional(),
        [CertExtendedKeyUsage.EMAIL_PROTECTION]: z.boolean().optional(),
        [CertExtendedKeyUsage.OCSP_SIGNING]: z.boolean().optional(),
        [CertExtendedKeyUsage.SERVER_AUTH]: z.boolean().optional(),
        [CertExtendedKeyUsage.TIMESTAMPING]: z.boolean().optional()
      })
      .default({})
  });
};

export type FormData = z.infer<ReturnType<typeof createSchema>>;

type Props = {
  popUp: UsePopUpState<["issueCertificate"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["issueCertificate"]>,
    state?: boolean
  ) => void;
  profileId?: string;
};

type TCertificateDetails = {
  serialNumber?: string;
  certificate?: string;
  certificateChain?: string;
  privateKey?: string;
};

export const CertificateIssuanceModal = ({ popUp, handlePopUpToggle, profileId }: Props) => {
  const [certificateDetails, setCertificateDetails] = useState<TCertificateDetails | null>(null);
  const [shouldShowSubjectSection, setShouldShowSubjectSection] = useState(true);
  const { currentProject } = useProject();

  const inputSerialNumber =
    (popUp?.issueCertificate?.data as { serialNumber: string })?.serialNumber || "";
  const sanitizedSerialNumber = inputSerialNumber.replace(/[^a-fA-F0-9:]/g, "");

  const { data: cert } = useGetCert(sanitizedSerialNumber);

  const { data: profilesData } = useListCertificateProfiles({
    projectId: currentProject?.id || "",
    enrollmentType: EnrollmentType.API,
    includeConfigs: true
  });

  const { mutateAsync: issueCertificate } = useUnifiedCertificateIssuance();

  const formResolver = useMemo(() => {
    return zodResolver(createSchema(shouldShowSubjectSection));
  }, [shouldShowSubjectSection]);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: formResolver,
    defaultValues: {
      profileId: profileId || "",
      subjectAttributes: [],
      subjectAltNames: [],
      ttl: "30d",
      signatureAlgorithm: "",
      keyAlgorithm: "",
      keyUsages: {},
      extendedKeyUsages: {}
    }
  });

  const actualSelectedProfileId = watch("profileId");
  const actualSelectedProfile = useMemo(
    () => profilesData?.certificateProfiles?.find((p) => p.id === actualSelectedProfileId),
    [profilesData?.certificateProfiles, actualSelectedProfileId]
  );

  const { data: templateData } = useGetCertificateTemplateV2ById({
    templateId: actualSelectedProfile?.certificateTemplateId || ""
  });

  useEffect(() => {
    if (templateData !== undefined) {
      setShouldShowSubjectSection((templateData?.subject?.length || 0) > 0);
    }
  }, [templateData]);

  const {
    constraints,
    filteredKeyUsages,
    filteredExtendedKeyUsages,
    availableSignatureAlgorithms,
    availableKeyAlgorithms,
    resetConstraints
  } = useCertificateTemplate(
    templateData,
    actualSelectedProfile,
    popUp?.issueCertificate?.isOpen || false,
    setValue,
    watch
  );

  const resetAllState = useCallback(() => {
    setCertificateDetails(null);
    setShouldShowSubjectSection(true);
    resetConstraints();
    reset();
  }, [reset, resetConstraints]);

  useEffect(() => {
    if (cert) {
      const subjectAttrs: Array<{ type: "common_name"; value: string }> = [];
      if (cert.commonName)
        subjectAttrs.push({ type: "common_name" as const, value: cert.commonName });

      reset({
        profileId: "",
        subjectAttributes:
          subjectAttrs.length > 0 ? subjectAttrs : [{ type: "common_name" as const, value: "" }],
        subjectAltNames: cert.subjectAltNames
          ? cert.subjectAltNames.split(",").map((name) => {
              const trimmed = name.trim();
              if (trimmed.includes("@"))
                return { type: CertSubjectAlternativeNameType.EMAIL, value: trimmed };
              if (trimmed.match(/^\d+\.\d+\.\d+\.\d+$/))
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

  const onFormSubmit = useCallback(
    async ({
      profileId: formProfileId,
      subjectAttributes,
      subjectAltNames,
      ttl,
      signatureAlgorithm,
      keyAlgorithm,
      keyUsages,
      extendedKeyUsages
    }: FormData) => {
      if (!currentProject?.slug || !currentProject?.id) {
        createNotification({
          text: "Project not found. Please refresh and try again.",
          type: "error"
        });
        return;
      }

      if (!formProfileId) {
        createNotification({
          text: "Please select a certificate profile.",
          type: "error"
        });
        return;
      }

      let commonName = "";
      if (
        constraints.shouldShowSubjectSection &&
        subjectAttributes &&
        subjectAttributes.length > 0
      ) {
        commonName = getAttributeValue(subjectAttributes, "common_name");
        if (!commonName.trim()) {
          createNotification({
            text: "Common name is required.",
            type: "error"
          });
          return;
        }
      }

      try {
        // Prepare unified request
        const request: any = {
          profileId: formProfileId,
          projectSlug: currentProject.slug,
          projectId: currentProject.id,
          ttl,
          keyUsages: filterUsages(keyUsages) as CertKeyUsage[],
          extendedKeyUsages: filterUsages(extendedKeyUsages) as CertExtendedKeyUsage[]
        };

        if (constraints.shouldShowSubjectSection && commonName) {
          request.commonName = commonName;
        }

        if (signatureAlgorithm) {
          request.signatureAlgorithm = signatureAlgorithm;
        }

        if (keyAlgorithm) {
          request.keyAlgorithm = keyAlgorithm;
        }

        if (constraints.shouldShowSanSection && subjectAltNames && subjectAltNames.length > 0) {
          const formattedSans = formatSubjectAltNames(subjectAltNames);
          if (formattedSans && formattedSans.length > 0) {
            request.altNames = formattedSans;
          }
        }

        const response = await issueCertificate(request);

        // Handle certificate issuance response
        if ("certificate" in response) {
          // Immediate certificate issuance
          setCertificateDetails({
            serialNumber: response.serialNumber,
            certificate: response.certificate,
            certificateChain: response.certificateChain,
            privateKey: response.privateKey
          });

          createNotification({
            text: "Successfully created certificate",
            type: "success"
          });
        } else {
          // Certificate request - async processing
          createNotification({
            text: `Certificate request submitted successfully. This may take a few minutes to process. Request ID: ${response.certificateRequestId}`,
            type: "success"
          });
          handlePopUpToggle("issueCertificate", false);
        }
      } catch (error) {
        createNotification({
          text: `Failed to request certificate: ${(error as Error)?.message || "Unknown error"}`,
          type: "error"
        });
      }
    },
    [
      currentProject?.slug,
      issueCertificate,
      constraints.shouldShowSubjectSection,
      constraints.shouldShowSanSection
    ]
  );

  const getModalTitle = () => {
    if (certificateDetails) return "Certificate Created Successfully";
    if (cert) return "Certificate Details";
    return "Request New Certificate";
  };

  const getModalSubTitle = () => {
    if (certificateDetails) return "Certificate has been successfully created and is ready for use";
    if (cert) return "View certificate information";
    return "Request a new certificate using a certificate profile";
  };

  return (
    <Modal
      isOpen={popUp?.issueCertificate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("issueCertificate", isOpen);
        if (!isOpen) {
          resetAllState();
        }
      }}
    >
      <ModalContent title={getModalTitle()} subTitle={getModalSubTitle()}>
        {certificateDetails && (
          <CertificateContent
            serialNumber={certificateDetails.serialNumber!}
            certificate={certificateDetails.certificate!}
            certificateChain={certificateDetails.certificateChain!}
            privateKey={certificateDetails.privateKey!}
          />
        )}
        {cert && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-mineshaft-300">Certificate Details</h4>
              <p className="text-sm text-mineshaft-400">Serial Number: {cert.serialNumber}</p>
              <p className="text-sm text-mineshaft-400">Certificate Id: {cert.id}</p>
              <p className="text-sm text-mineshaft-400">Common Name: {cert.commonName}</p>
              <p className="text-sm text-mineshaft-400">Status: {cert.status}</p>
            </div>
          </div>
        )}
        {!cert && !certificateDetails && (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            {!profileId && (
              <Controller
                control={control}
                name="profileId"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label={
                      <div>
                        <FormLabel
                          isRequired
                          label="Certificate Profile"
                          icon={
                            <Tooltip
                              className="text-center"
                              content={
                                <span>
                                  Certificate profiles define the policies and enrollment methods
                                  for certificate issuance. The selected profile will enforce
                                  validation rules and determine the CA used for signing.
                                </span>
                              }
                            >
                              <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                            </Tooltip>
                          }
                        />
                      </div>
                    }
                    errorText={error?.message}
                    isError={Boolean(error)}
                    isRequired
                  >
                    <Select
                      defaultValue=""
                      {...field}
                      onValueChange={(e) => onChange(e)}
                      className="w-full"
                      placeholder="Select a certificate profile"
                      position="popper"
                    >
                      {profilesData?.certificateProfiles?.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.slug}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            )}

            {(actualSelectedProfile || profileId) && (
              <>
                {constraints.shouldShowSubjectSection && (
                  <Controller
                    control={control}
                    name="subjectAttributes"
                    render={({ field: { onChange, value }, fieldState: { error } }) => (
                      <FormControl
                        label="Common Name"
                        isRequired
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Input
                          value={value?.[0]?.value || ""}
                          onChange={(e) => {
                            onChange([{ type: "common_name", value: e.target.value }]);
                          }}
                          placeholder="example.com"
                        />
                      </FormControl>
                    )}
                  />
                )}

                {constraints.shouldShowSanSection && (
                  <SubjectAltNamesField
                    control={control}
                    allowedSanTypes={constraints.allowedSanTypes}
                    error={formState.errors.subjectAltNames?.message}
                  />
                )}

                <Controller
                  control={control}
                  name="ttl"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Time to Live (TTL)"
                      isRequired
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input {...field} placeholder="30d, 1y, 8760h" />
                    </FormControl>
                  )}
                />

                <AlgorithmSelectors
                  control={control}
                  availableSignatureAlgorithms={availableSignatureAlgorithms}
                  availableKeyAlgorithms={availableKeyAlgorithms}
                  signatureError={formState.errors.signatureAlgorithm?.message}
                  keyError={formState.errors.keyAlgorithm?.message}
                />

                <Accordion type="single" collapsible className="w-full">
                  <KeyUsageSection
                    control={control}
                    title="Key Usages"
                    accordionValue="key-usages"
                    namePrefix="keyUsages"
                    options={filteredKeyUsages}
                    requiredUsages={constraints.requiredKeyUsages}
                  />
                  <KeyUsageSection
                    control={control}
                    title="Extended Key Usages"
                    accordionValue="extended-key-usages"
                    namePrefix="extendedKeyUsages"
                    options={filteredExtendedKeyUsages}
                    requiredUsages={constraints.requiredExtendedKeyUsages}
                  />
                </Accordion>
              </>
            )}

            <div className="mt-7 flex items-center">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={isSubmitting || (!actualSelectedProfile && !profileId)}
              >
                {cert ? "Update" : "Request Certificate"}
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => {
                  handlePopUpToggle("issueCertificate", false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
};
