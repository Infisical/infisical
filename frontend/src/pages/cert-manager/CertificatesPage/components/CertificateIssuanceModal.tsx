import { useCallback, useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { useGetCert } from "@app/hooks/api";
import { useGetCertificatePolicyById } from "@app/hooks/api/certificatePolicies";
import { EnrollmentType, useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import {
  CertExtendedKeyUsage,
  CertificateRequestStatus,
  CertKeyUsage
} from "@app/hooks/api/certificates/enums";
import { useUnifiedCertificateIssuance } from "@app/hooks/api/certificates/mutations";
import { UsePopUpState } from "@app/hooks/usePopUp";
import {
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { AlgorithmSelectors } from "./AlgorithmSelectors";
import { filterUsages, formatSubjectAltNames } from "./certificateUtils";
import { KeyUsageSection } from "./KeyUsageSection";
import { SubjectAltNamesField } from "./SubjectAltNamesField";
import { SubjectAttributesField } from "./SubjectAttributesField";
import { useCertificatePolicy } from "./useCertificatePolicy";

enum RequestMethod {
  MANAGED = "managed",
  CSR = "csr"
}

const baseSchema = z.object({
  profileId: z.string().min(1, "Profile is required"),
  ttl: z.string().trim().min(1, "TTL is required")
});

const csrSchema = baseSchema.extend({
  requestMethod: z.literal(RequestMethod.CSR),
  csr: z.string().min(1, "CSR is required")
});

const managedSchema = baseSchema.extend({
  requestMethod: z.literal(RequestMethod.MANAGED),
  subjectAttributes: z
    .array(
      z.object({
        type: z.nativeEnum(CertSubjectAttributeType),
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
  basicConstraints: z
    .object({
      isCA: z.boolean().default(false),
      pathLength: z.number().min(0).nullable().optional()
    })
    .optional(),
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

const formSchema = z.discriminatedUnion("requestMethod", [csrSchema, managedSchema]);

export type FormData = z.infer<typeof formSchema>;

type Props = {
  popUp: UsePopUpState<["issueCertificate"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["issueCertificate"]>,
    state?: boolean
  ) => void;
  profileId?: string;
};

export const CertificateIssuanceModal = ({ popUp, handlePopUpToggle, profileId }: Props) => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();

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

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
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

  const requestMethod = watch("requestMethod");

  const actualSelectedProfileId = watch("profileId");
  const watchedIsCA = watch("basicConstraints.isCA") || false;
  const actualSelectedProfile = useMemo(
    () => profilesData?.certificateProfiles?.find((p) => p.id === actualSelectedProfileId),
    [profilesData?.certificateProfiles, actualSelectedProfileId]
  );

  const { data: policyData } = useGetCertificatePolicyById({
    policyId: actualSelectedProfile?.certificatePolicyId || ""
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
          handlePopUpToggle("issueCertificate", false);
          if (currentOrg?.id && currentProject?.id && response.certificate.certificateId) {
            navigate({
              to: "/organizations/$orgId/projects/cert-manager/$projectId/certificates/$certificateId",
              params: {
                orgId: currentOrg.id,
                projectId: currentProject.id,
                certificateId: response.certificate.certificateId
              }
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
          handlePopUpToggle("issueCertificate", false);
        } else {
          createNotification({
            text: `Certificate request submitted successfully. This may take a few minutes to process. Certificate Request ID: ${response.certificateRequestId}`,
            type: "success"
          });
          handlePopUpToggle("issueCertificate", false);
        }
      };

      try {
        if (formData.requestMethod === RequestMethod.CSR) {
          const response = await issueCertificate({
            profileId: formProfileId,
            projectSlug: currentProject.slug,
            projectId: currentProject.id,
            csr: formData.csr,
            attributes: { ttl }
          });

          handleIssuanceResponse(response);
          return;
        }

        const {
          subjectAttributes,
          subjectAltNames,
          basicConstraints,
          signatureAlgorithm,
          keyAlgorithm,
          keyUsages,
          extendedKeyUsages
        } = formData;

        const request: any = {
          profileId: formProfileId,
          projectSlug: currentProject.slug,
          projectId: currentProject.id,
          attributes: {
            ttl,
            signatureAlgorithm: signatureAlgorithm || "",
            keyAlgorithm: keyAlgorithm || "",
            keyUsages: filterUsages(keyUsages) as CertKeyUsage[],
            extendedKeyUsages: filterUsages(extendedKeyUsages) as CertExtendedKeyUsage[]
          }
        };

        if (
          constraints.shouldShowSubjectSection &&
          subjectAttributes &&
          subjectAttributes.length > 0
        ) {
          const cnAttr = subjectAttributes.find(
            (attr) => attr.type === CertSubjectAttributeType.COMMON_NAME
          );
          if (cnAttr?.value) {
            request.attributes.commonName = cnAttr.value;
          }

          const orgAttr = subjectAttributes.find(
            (attr) => attr.type === CertSubjectAttributeType.ORGANIZATION
          );
          if (orgAttr?.value) {
            request.attributes.organization = orgAttr.value;
          }

          const ouAttr = subjectAttributes.find(
            (attr) => attr.type === CertSubjectAttributeType.ORGANIZATIONAL_UNIT
          );
          if (ouAttr?.value) {
            request.attributes.organizationUnit = ouAttr.value;
          }

          const countryAttr = subjectAttributes.find(
            (attr) => attr.type === CertSubjectAttributeType.COUNTRY
          );
          if (countryAttr?.value) {
            request.attributes.country = countryAttr.value;
          }

          const stateAttr = subjectAttributes.find(
            (attr) => attr.type === CertSubjectAttributeType.STATE
          );
          if (stateAttr?.value) {
            request.attributes.state = stateAttr.value;
          }

          const localityAttr = subjectAttributes.find(
            (attr) => attr.type === CertSubjectAttributeType.LOCALITY
          );
          if (localityAttr?.value) {
            request.attributes.locality = localityAttr.value;
          }
        }

        if (constraints.shouldShowSanSection && subjectAltNames && subjectAltNames.length > 0) {
          const formattedSans = formatSubjectAltNames(subjectAltNames);
          if (formattedSans && formattedSans.length > 0) {
            request.attributes.altNames = formattedSans;
          }
        }

        if (
          (constraints.templateAllowsCA && basicConstraints?.isCA) ||
          constraints.templateRequiresCA
        ) {
          request.attributes.basicConstraints = {
            isCA: true,
            pathLength: basicConstraints?.pathLength ?? undefined
          };
        }

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
      constraints.shouldShowSubjectSection,
      constraints.shouldShowSanSection,
      constraints.templateAllowsCA,
      constraints.templateRequiresCA,
      handlePopUpToggle,
      navigate
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
        {!cert && (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="requestMethod"
              render={({ field: { onChange, value } }) => (
                <FormControl
                  label={
                    <FormLabel
                      label="Request Method"
                      icon={
                        <Tooltip
                          content={
                            <div className="space-y-2">
                              <p>
                                <strong>Managed:</strong> We generate and manage the private key for
                                you.
                              </p>
                              <p>
                                <strong>CSR:</strong> Provide your own Certificate Signing Request.
                                Use this when you need to manage your own private key.
                              </p>
                            </div>
                          }
                        >
                          <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                        </Tooltip>
                      }
                    />
                  }
                >
                  <Select
                    value={value}
                    onValueChange={(val) => onChange(val as RequestMethod)}
                    className="w-full"
                  >
                    <SelectItem value={RequestMethod.MANAGED}>Managed</SelectItem>
                    <SelectItem value={RequestMethod.CSR}>
                      Certificate Signing Request (CSR)
                    </SelectItem>
                  </Select>
                </FormControl>
              )}
            />

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
                {requestMethod === RequestMethod.CSR && (
                  <Controller
                    control={control}
                    name="csr"
                    shouldUnregister
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Certificate Signing Request (CSR)"
                        isRequired
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <TextArea
                          {...field}
                          spellCheck={false}
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
                      </FormControl>
                    )}
                  />
                )}

                {requestMethod === RequestMethod.MANAGED &&
                  constraints.shouldShowSubjectSection && (
                    <SubjectAttributesField
                      control={control}
                      allowedAttributeTypes={constraints.allowedSubjectAttributeTypes}
                      error={
                        (formState.errors as { subjectAttributes?: { message?: string } })
                          .subjectAttributes?.message
                      }
                      shouldUnregister
                    />
                  )}

                {requestMethod === RequestMethod.MANAGED && constraints.shouldShowSanSection && (
                  <SubjectAltNamesField
                    control={control}
                    allowedSanTypes={constraints.allowedSanTypes}
                    error={
                      (formState.errors as { subjectAltNames?: { message?: string } })
                        .subjectAltNames?.message
                    }
                    shouldUnregister
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

                {requestMethod === RequestMethod.MANAGED && (
                  <>
                    <AlgorithmSelectors
                      control={control}
                      availableSignatureAlgorithms={availableSignatureAlgorithms}
                      availableKeyAlgorithms={availableKeyAlgorithms}
                      signatureError={
                        (formState.errors as { signatureAlgorithm?: { message?: string } })
                          .signatureAlgorithm?.message
                      }
                      keyError={
                        (formState.errors as { keyAlgorithm?: { message?: string } }).keyAlgorithm
                          ?.message
                      }
                      shouldUnregister
                    />

                    <Accordion type="single" collapsible className="w-full">
                      <KeyUsageSection
                        control={control}
                        title="Key Usages"
                        accordionValue="key-usages"
                        namePrefix="keyUsages"
                        options={filteredKeyUsages}
                        requiredUsages={constraints.requiredKeyUsages}
                        shouldUnregister
                      />
                      <KeyUsageSection
                        control={control}
                        title="Extended Key Usages"
                        accordionValue="extended-key-usages"
                        namePrefix="extendedKeyUsages"
                        options={filteredExtendedKeyUsages}
                        requiredUsages={constraints.requiredExtendedKeyUsages}
                        shouldUnregister
                      />
                      {constraints.templateAllowsCA && (
                        <AccordionItem value="basic-constraints">
                          <AccordionTrigger>Basic Constraints</AccordionTrigger>
                          <AccordionContent forceMount className="data-[state=closed]:hidden">
                            <div className="space-y-4 pl-2">
                              <Controller
                                control={control}
                                name="basicConstraints.isCA"
                                shouldUnregister
                                render={({ field: { value, onChange } }) => (
                                  <div className="flex items-center gap-3">
                                    <Checkbox
                                      id="isCA"
                                      isChecked={constraints.templateRequiresCA || value || false}
                                      isDisabled={constraints.templateRequiresCA}
                                      onCheckedChange={(checked) => {
                                        if (!constraints.templateRequiresCA) {
                                          onChange(checked);
                                          if (!checked) {
                                            setValue("basicConstraints.pathLength", undefined);
                                          }
                                        }
                                      }}
                                    />
                                    <div className="space-y-1">
                                      <FormLabel
                                        id="isCA"
                                        className="cursor-pointer text-sm font-medium text-mineshaft-100"
                                        label="Issue as Certificate Authority"
                                      />
                                      <p className="text-xs text-bunker-300">
                                        This certificate will be issued with the CA:TRUE extension
                                      </p>
                                    </div>
                                  </div>
                                )}
                              />

                              {watchedIsCA && (
                                <Controller
                                  control={control}
                                  name="basicConstraints.pathLength"
                                  shouldUnregister
                                  render={({ field, fieldState: { error } }) => {
                                    const isPathLengthRequired =
                                      typeof constraints.maxPathLength === "number" &&
                                      constraints.maxPathLength !== -1;
                                    return (
                                      <FormControl
                                        label={
                                          <div>
                                            <FormLabel
                                              isRequired={isPathLengthRequired}
                                              label="Path Length"
                                              icon={
                                                <Tooltip
                                                  content={
                                                    <div className="max-w-xs">
                                                      <p className="font-medium">Values:</p>
                                                      <ul className="mt-1 list-disc pl-4 text-xs">
                                                        <li>
                                                          <strong>Empty</strong> = Unlimited depth
                                                        </li>
                                                        <li>
                                                          <strong>0</strong> = Can only sign
                                                          end-entity certs
                                                        </li>
                                                        <li>
                                                          <strong>1+</strong> = CA levels allowed
                                                          beneath
                                                        </li>
                                                      </ul>
                                                    </div>
                                                  }
                                                >
                                                  <FontAwesomeIcon
                                                    icon={faQuestionCircle}
                                                    size="sm"
                                                  />
                                                </Tooltip>
                                              }
                                            />
                                          </div>
                                        }
                                        isError={Boolean(error)}
                                        errorText={error?.message}
                                        helperText="Sets the pathLen for this CA certificate. Controls how many levels of sub-CAs can exist below."
                                      >
                                        <Input
                                          {...field}
                                          type="number"
                                          min={0}
                                          placeholder={
                                            isPathLengthRequired
                                              ? "Enter path length (required)"
                                              : "Leave empty for no constraint"
                                          }
                                          className="w-full"
                                          value={field.value ?? ""}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === "") {
                                              field.onChange(undefined);
                                            } else {
                                              const numVal = parseInt(val, 10);
                                              field.onChange(
                                                Number.isNaN(numVal) ? undefined : numVal
                                              );
                                            }
                                          }}
                                        />
                                      </FormControl>
                                    );
                                  }}
                                />
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                    </Accordion>
                  </>
                )}
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
                  resetAllState();
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
