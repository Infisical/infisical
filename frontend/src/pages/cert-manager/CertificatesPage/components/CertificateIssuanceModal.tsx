import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faPlus, faQuestionCircle, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
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
  IconButton,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
import { useProject } from "@app/context";
import { useCreateCertificateV3, useGetCert } from "@app/hooks/api";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import {
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { useGetCertificateTemplateV2ById } from "@app/hooks/api/certificateTemplates/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";
import {
  mapTemplateKeyAlgorithmToApi,
  mapTemplateSignatureAlgorithmToApi
} from "@app/pages/cert-manager/PoliciesPage/components/CertificateTemplatesV2Tab/shared/certificate-constants";

import { CertificateContent } from "./CertificateContent";

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
          type: z.enum(["dns", "ip", "email", "uri"]),
          value: z.string().min(1, "Value is required")
        })
      )
      .default([]),
    ttl: z.string().trim().min(1, "TTL is required"),
    signatureAlgorithm: z.string().min(1, "Signature algorithm is required"),
    keyAlgorithm: z.string().min(1, "Key algorithm is required"),
    keyUsages: z.object({
      [CertKeyUsage.DIGITAL_SIGNATURE]: z.boolean().optional(),
      [CertKeyUsage.KEY_ENCIPHERMENT]: z.boolean().optional(),
      [CertKeyUsage.NON_REPUDIATION]: z.boolean().optional(),
      [CertKeyUsage.DATA_ENCIPHERMENT]: z.boolean().optional(),
      [CertKeyUsage.KEY_AGREEMENT]: z.boolean().optional(),
      [CertKeyUsage.KEY_CERT_SIGN]: z.boolean().optional(),
      [CertKeyUsage.CRL_SIGN]: z.boolean().optional(),
      [CertKeyUsage.ENCIPHER_ONLY]: z.boolean().optional(),
      [CertKeyUsage.DECIPHER_ONLY]: z.boolean().optional()
    }),
    extendedKeyUsages: z.object({
      [CertExtendedKeyUsage.CLIENT_AUTH]: z.boolean().optional(),
      [CertExtendedKeyUsage.CODE_SIGNING]: z.boolean().optional(),
      [CertExtendedKeyUsage.EMAIL_PROTECTION]: z.boolean().optional(),
      [CertExtendedKeyUsage.OCSP_SIGNING]: z.boolean().optional(),
      [CertExtendedKeyUsage.SERVER_AUTH]: z.boolean().optional(),
      [CertExtendedKeyUsage.TIMESTAMPING]: z.boolean().optional()
    })
  });
};

export type FormData = z.infer<ReturnType<typeof createSchema>>;

type Props = {
  popUp: UsePopUpState<["certificateIssuance"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["certificateIssuance"]>,
    state?: boolean
  ) => void;
  profileId?: string;
};

type TCertificateDetails = {
  serialNumber: string;
  certificate: string;
  certificateChain: string;
  privateKey: string;
};

export const CertificateIssuanceModal = ({ popUp, handlePopUpToggle, profileId }: Props) => {
  const [certificateDetails, setCertificateDetails] = useState<TCertificateDetails | null>(null);
  const [allowedKeyUsages, setAllowedKeyUsages] = useState<string[]>([]);
  const [allowedExtendedKeyUsages, setAllowedExtendedKeyUsages] = useState<string[]>([]);
  const [requiredKeyUsages, setRequiredKeyUsages] = useState<string[]>([]);
  const [requiredExtendedKeyUsages, setRequiredExtendedKeyUsages] = useState<string[]>([]);
  const [allowedSignatureAlgorithms, setAllowedSignatureAlgorithms] = useState<string[]>([]);
  const [allowedKeyAlgorithms, setAllowedKeyAlgorithms] = useState<string[]>([]);
  const [allowedSanTypes, setAllowedSanTypes] = useState<string[]>(["dns", "ip", "email", "uri"]);
  const [shouldShowSanSection, setShouldShowSanSection] = useState<boolean>(true);
  const [shouldShowSubjectSection, setShouldShowSubjectSection] = useState<boolean>(true);
  const { currentProject } = useProject();

  const inputSerialNumber =
    (popUp?.certificateIssuance?.data as { serialNumber: string })?.serialNumber || "";
  const sanitizedSerialNumber = inputSerialNumber.replace(/[^a-fA-F0-9:]/g, "");

  const { data: cert } = useGetCert(sanitizedSerialNumber);

  const { data: profilesData } = useListCertificateProfiles({
    projectId: currentProject?.id || "",
    includeMetrics: false
  });

  const { mutateAsync: createCertificate } = useCreateCertificateV3();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(createSchema(shouldShowSubjectSection)),
    defaultValues: {
      profileId: profileId || "",
      subjectAttributes: shouldShowSubjectSection
        ? [{ type: "common_name", value: "" }]
        : undefined,
      subjectAltNames: [],
      ttl: "30d",
      signatureAlgorithm: "",
      keyAlgorithm: "",
      keyUsages: {},
      extendedKeyUsages: {}
    }
  });

  const resetAllState = useCallback(() => {
    setCertificateDetails(null);
    setAllowedKeyUsages([]);
    setAllowedExtendedKeyUsages([]);
    setRequiredKeyUsages([]);
    setRequiredExtendedKeyUsages([]);
    setAllowedSignatureAlgorithms([]);
    setAllowedKeyAlgorithms([]);
    setAllowedSanTypes(["dns", "ip", "email", "uri"]);
    setShouldShowSanSection(true);
    setShouldShowSubjectSection(true);
    reset();
  }, [reset]);

  const selectedProfileId = watch("profileId");
  const selectedProfile = useMemo(
    () => profilesData?.certificateProfiles?.find((p) => p.id === selectedProfileId),
    [profilesData?.certificateProfiles, selectedProfileId]
  );

  const { data: templateData } = useGetCertificateTemplateV2ById({
    templateId: selectedProfile?.certificateTemplateId || ""
  });

  const filteredKeyUsages = useMemo(() => {
    return KEY_USAGES_OPTIONS.filter(({ value }) => allowedKeyUsages.includes(value));
  }, [allowedKeyUsages]);

  const filteredExtendedKeyUsages = useMemo(() => {
    return EXTENDED_KEY_USAGES_OPTIONS.filter(({ value }) =>
      allowedExtendedKeyUsages.includes(value)
    );
  }, [allowedExtendedKeyUsages]);

  const mapBackendSanTypeToFrontend = (backendType: string): string => {
    switch (backendType) {
      case "dns_name":
        return "dns";
      case "ip_address":
        return "ip";
      case "email":
        return "email";
      case "uri":
        return "uri";
      default:
        return backendType;
    }
  };

  const availableSignatureAlgorithms = useMemo(() => {
    return allowedSignatureAlgorithms.map((templateAlgorithm) => {
      const apiAlgorithm = mapTemplateSignatureAlgorithmToApi(templateAlgorithm);
      return {
        value: apiAlgorithm,
        label: apiAlgorithm
      };
    });
  }, [allowedSignatureAlgorithms]);

  const availableKeyAlgorithms = useMemo(() => {
    return allowedKeyAlgorithms.map((templateAlgorithm) => {
      const apiAlgorithm = mapTemplateKeyAlgorithmToApi(templateAlgorithm);
      return {
        value: apiAlgorithm,
        label: apiAlgorithm
      };
    });
  }, [allowedKeyAlgorithms]);

  useEffect(() => {
    if (templateData && selectedProfile && popUp?.certificateIssuance?.isOpen) {
      if (templateData.algorithms?.signature && templateData.algorithms.signature.length > 0) {
        setAllowedSignatureAlgorithms(templateData.algorithms.signature);
      } else {
        setAllowedSignatureAlgorithms([]);
      }

      if (
        templateData.algorithms?.keyAlgorithm &&
        templateData.algorithms.keyAlgorithm.length > 0
      ) {
        setAllowedKeyAlgorithms(templateData.algorithms.keyAlgorithm);
      } else {
        setAllowedKeyAlgorithms([]);
      }

      if (templateData.validity?.max) {
        setValue("ttl", templateData.validity.max);
      }

      const keyUsages: string[] = [];
      if (templateData.keyUsages?.required) {
        keyUsages.push(...templateData.keyUsages.required);
      }
      if (templateData.keyUsages?.allowed) {
        keyUsages.push(...templateData.keyUsages.allowed);
      }
      setAllowedKeyUsages(keyUsages);

      const extendedKeyUsages: string[] = [];
      if (templateData.extendedKeyUsages?.required) {
        extendedKeyUsages.push(...templateData.extendedKeyUsages.required);
      }
      if (templateData.extendedKeyUsages?.allowed) {
        extendedKeyUsages.push(...templateData.extendedKeyUsages.allowed);
      }
      setAllowedExtendedKeyUsages(extendedKeyUsages);

      setRequiredKeyUsages(templateData.keyUsages?.required || []);
      setRequiredExtendedKeyUsages(templateData.extendedKeyUsages?.required || []);

      if (templateData.sans && templateData.sans.length > 0) {
        const sanTypes: string[] = [];
        templateData.sans.forEach((sanPolicy) => {
          const frontendType = mapBackendSanTypeToFrontend(sanPolicy.type);
          if (!sanTypes.includes(frontendType)) {
            sanTypes.push(frontendType);
          }
        });
        setAllowedSanTypes(sanTypes);
        setShouldShowSanSection(true);
      } else {
        setAllowedSanTypes([]);
        setShouldShowSanSection(false);
        setValue("subjectAltNames", []);
      }

      if (templateData.subject && templateData.subject.length > 0) {
        setShouldShowSubjectSection(true);
        const currentSubjectAttrs = watch("subjectAttributes");
        if (!currentSubjectAttrs || currentSubjectAttrs.length === 0) {
          setValue("subjectAttributes", [{ type: "common_name", value: "" }]);
        }
      } else {
        setShouldShowSubjectSection(false);
        setValue("subjectAttributes", undefined);
      }

      const initialKeyUsages: Record<string, boolean> = {};
      const initialExtendedKeyUsages: Record<string, boolean> = {};

      (templateData.keyUsages?.required || []).forEach((usage: string) => {
        initialKeyUsages[usage] = true;
      });

      (templateData.extendedKeyUsages?.required || []).forEach((usage: string) => {
        initialExtendedKeyUsages[usage] = true;
      });

      setValue("keyUsages", initialKeyUsages);
      setValue("extendedKeyUsages", initialExtendedKeyUsages);
    }
  }, [templateData, selectedProfile, setValue, watch, popUp?.certificateIssuance?.isOpen]);

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
              if (trimmed.includes("@")) return { type: "email" as const, value: trimmed };
              if (trimmed.match(/^\d+\.\d+\.\d+\.\d+$/))
                return { type: "ip" as const, value: trimmed };
              if (trimmed.startsWith("http")) return { type: "uri" as const, value: trimmed };
              return { type: "dns" as const, value: trimmed };
            })
          : [],
        ttl: "",
        keyUsages: Object.fromEntries((cert.keyUsages || []).map((name) => [name, true])),
        extendedKeyUsages: Object.fromEntries(
          (cert.extendedKeyUsages || []).map((name) => [name, true])
        )
      });
    }
  }, [cert, reset]);

  useEffect(() => {
    if (popUp?.certificateIssuance?.isOpen && profileId && !cert) {
      setValue("profileId", profileId);
    }
  }, [popUp?.certificateIssuance?.isOpen, profileId, cert, setValue]);

  const getAttributeValue = useCallback(
    (subjectAttributes: FormData["subjectAttributes"], type: string) => {
      const foundAttr = subjectAttributes?.find((attr) => attr.type === type);
      return foundAttr?.value || "";
    },
    []
  );

  const formatSubjectAltNames = useCallback((subjectAltNames: FormData["subjectAltNames"]) => {
    return subjectAltNames
      .filter((san) => san.value.trim())
      .map((san) => san.value.trim())
      .join(", ");
  }, []);

  const filterUsages = useCallback(<T extends Record<string, boolean>>(usages: T) => {
    return Object.entries(usages)
      .filter(([, value]) => value)
      .map(([key]) => key);
  }, []);

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
      try {
        if (!currentProject?.slug) {
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
        if (shouldShowSubjectSection && subjectAttributes && subjectAttributes.length > 0) {
          commonName = getAttributeValue(subjectAttributes, "common_name");
          if (!commonName.trim()) {
            createNotification({
              text: "Common name is required.",
              type: "error"
            });
            return;
          }
        }

        const certificateRequest: any = {
          profileId: formProfileId,
          projectSlug: currentProject.slug,
          ttl,
          signatureAlgorithm,
          keyAlgorithm,
          keyUsages: filterUsages(keyUsages) as CertKeyUsage[],
          extendedKeyUsages: filterUsages(extendedKeyUsages) as CertExtendedKeyUsage[]
        };

        if (shouldShowSubjectSection && commonName) {
          certificateRequest.commonName = commonName;
        }
        if (shouldShowSanSection && subjectAltNames && subjectAltNames.length > 0) {
          const formattedSans = formatSubjectAltNames(subjectAltNames);
          if (formattedSans) {
            certificateRequest.subjectAltNames = formattedSans;
          }
        }

        const { serialNumber, certificate, certificateChain, privateKey } =
          await createCertificate(certificateRequest);

        setCertificateDetails({
          serialNumber,
          certificate,
          certificateChain,
          privateKey
        });

        createNotification({
          text: "Successfully created certificate",
          type: "success"
        });
      } catch (err) {
        console.error("Certificate creation failed:", err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while creating the certificate";
        createNotification({
          text: `Failed to create certificate: ${errorMessage}`,
          type: "error"
        });
      }
    },
    [
      currentProject?.slug,
      createCertificate,
      shouldShowSubjectSection,
      shouldShowSanSection,
      getAttributeValue,
      formatSubjectAltNames,
      filterUsages
    ]
  );

  const getModalTitle = () => {
    if (certificateDetails) return "Certificate Created Successfully";
    if (cert) return "Certificate Details";
    return "Issue New Certificate";
  };

  const getModalSubTitle = () => {
    if (certificateDetails) return "Certificate has been successfully created and is ready for use";
    if (cert) return "View certificate information";
    return "Issue a new certificate using a certificate profile";
  };

  const getSanPlaceholder = (sanType: string) => {
    switch (sanType) {
      case "dns":
        return "example.com or *.example.com";
      case "ip":
        return "192.168.1.1";
      case "email":
        return "admin@example.com";
      case "uri":
        return "https://example.com";
      default:
        return "Enter value";
    }
  };

  return (
    <Modal
      isOpen={popUp?.certificateIssuance?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificateIssuance", isOpen);
        if (!isOpen) {
          resetAllState();
        }
      }}
    >
      <ModalContent title={getModalTitle()} subTitle={getModalSubTitle()}>
        {certificateDetails && (
          <CertificateContent
            serialNumber={certificateDetails.serialNumber}
            certificate={certificateDetails.certificate}
            certificateChain={certificateDetails.certificateChain}
            privateKey={certificateDetails.privateKey}
          />
        )}
        {cert && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-mineshaft-300">Certificate Details</h4>
              <p className="text-sm text-mineshaft-400">Serial Number: {cert.serialNumber}</p>
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

            {(selectedProfile || profileId) && (
              <>
                {shouldShowSubjectSection && (
                  <Controller
                    control={control}
                    name="subjectAttributes"
                    render={({ field: { onChange, value }, fieldState: { error } }) => (
                      <FormControl
                        label="Subject Attributes"
                        isRequired
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <div className="space-y-2">
                          {(value || []).map((attr, index) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <div key={`subject-attr-${index}`} className="flex items-center gap-2">
                              <Select
                                value={attr.type}
                                onValueChange={(newType) => {
                                  const newValue = [...(value || [])];
                                  newValue[index] = {
                                    ...attr,
                                    type: newType as typeof attr.type
                                  };
                                  onChange(newValue);
                                }}
                                className="w-48"
                              >
                                <SelectItem value="common_name">Common Name</SelectItem>
                              </Select>
                              <Input
                                value={attr.value}
                                onChange={(e) => {
                                  const newValue = [...(value || [])];
                                  newValue[index] = { ...attr, value: e.target.value };
                                  onChange(newValue);
                                }}
                                placeholder="example.com"
                                className="flex-1"
                              />
                              {(value || []).length > 1 && (
                                <IconButton
                                  ariaLabel="Remove Subject Attribute"
                                  variant="plain"
                                  size="sm"
                                  onClick={() => {
                                    const newValue = (value || []).filter((_, i) => i !== index);
                                    onChange(newValue);
                                  }}
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                </IconButton>
                              )}
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline_bg"
                            size="xs"
                            leftIcon={<FontAwesomeIcon icon={faPlus} />}
                            onClick={() => {
                              onChange([...(value || []), { type: "common_name", value: "" }]);
                            }}
                            className="w-full"
                          >
                            Add Subject Attribute
                          </Button>
                        </div>
                      </FormControl>
                    )}
                  />
                )}

                {shouldShowSanSection && (
                  <Controller
                    control={control}
                    name="subjectAltNames"
                    render={({ field: { onChange, value }, fieldState: { error } }) => (
                      <FormControl
                        label="Subject Alternative Names (SANs)"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <div className="space-y-2">
                          {value.map((san, index) => (
                            <div
                              // eslint-disable-next-line react/no-array-index-key
                              key={`subject-alt-name-${index}`}
                              className="flex items-center gap-2"
                            >
                              <Select
                                value={san.type}
                                onValueChange={(newType) => {
                                  const newValue = [...value];
                                  newValue[index] = {
                                    ...san,
                                    type: newType as "dns" | "ip" | "email" | "uri"
                                  };
                                  onChange(newValue);
                                }}
                                className="w-24"
                              >
                                {allowedSanTypes.includes("dns") && (
                                  <SelectItem value="dns">DNS</SelectItem>
                                )}
                                {allowedSanTypes.includes("ip") && (
                                  <SelectItem value="ip">IP</SelectItem>
                                )}
                                {allowedSanTypes.includes("email") && (
                                  <SelectItem value="email">Email</SelectItem>
                                )}
                                {allowedSanTypes.includes("uri") && (
                                  <SelectItem value="uri">URI</SelectItem>
                                )}
                              </Select>
                              <Input
                                value={san.value}
                                onChange={(e) => {
                                  const newValue = [...value];
                                  newValue[index] = { ...san, value: e.target.value };
                                  onChange(newValue);
                                }}
                                placeholder={getSanPlaceholder(san.type)}
                                className="flex-1"
                              />
                              <IconButton
                                ariaLabel="Remove SAN"
                                variant="plain"
                                size="sm"
                                onClick={() => {
                                  const newValue = value.filter((_, i) => i !== index);
                                  onChange(newValue);
                                }}
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </IconButton>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline_bg"
                            size="xs"
                            leftIcon={<FontAwesomeIcon icon={faPlus} />}
                            onClick={() => {
                              const defaultType =
                                allowedSanTypes.length > 0 ? allowedSanTypes[0] : "dns";
                              onChange([
                                ...value,
                                { type: defaultType as "dns" | "ip" | "email" | "uri", value: "" }
                              ]);
                            }}
                            className="w-full"
                          >
                            Add SAN
                          </Button>
                        </div>
                      </FormControl>
                    )}
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Controller
                      control={control}
                      name="signatureAlgorithm"
                      render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                        <FormControl
                          label="Signature Algorithm"
                          errorText={error?.message}
                          isError={Boolean(error)}
                        >
                          <Select
                            defaultValue=""
                            {...field}
                            onValueChange={(e) => onChange(e)}
                            className="w-full"
                            placeholder={
                              availableSignatureAlgorithms.length > 0
                                ? "Select signature algorithm"
                                : "No algorithms available"
                            }
                            position="popper"
                          >
                            {availableSignatureAlgorithms.map((algorithm) => (
                              <SelectItem key={algorithm.value} value={algorithm.value}>
                                {algorithm.label}
                              </SelectItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    />
                  </div>

                  <div>
                    <Controller
                      control={control}
                      name="keyAlgorithm"
                      render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                        <FormControl
                          label="Key Algorithm"
                          errorText={error?.message}
                          isError={Boolean(error)}
                        >
                          <Select
                            defaultValue=""
                            {...field}
                            onValueChange={(e) => onChange(e)}
                            className="w-full"
                            placeholder={
                              availableKeyAlgorithms.length > 0
                                ? "Select key algorithm"
                                : "No algorithms available"
                            }
                            position="popper"
                          >
                            {availableKeyAlgorithms.map((algorithm) => (
                              <SelectItem key={algorithm.value} value={algorithm.value}>
                                {algorithm.label}
                              </SelectItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    />
                  </div>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {filteredKeyUsages.length > 0 && (
                    <AccordionItem value="key-usages">
                      <AccordionTrigger>Key Usages</AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-2 gap-2 pl-2">
                          {filteredKeyUsages.map(({ label, value }) => {
                            const isRequired = requiredKeyUsages.includes(value);
                            return (
                              <Controller
                                key={label}
                                control={control}
                                name={`keyUsages.${value}` as any}
                                render={({ field }) => (
                                  <div className="flex items-center space-x-3">
                                    <Checkbox
                                      id={`key-usage-${value}`}
                                      isChecked={field.value || false}
                                      onCheckedChange={(checked) => {
                                        if (!isRequired) {
                                          field.onChange(checked);
                                        }
                                      }}
                                      isDisabled={isRequired}
                                    />
                                    <div className="flex items-center gap-2">
                                      <FormLabel
                                        id={`key-usage-${value}`}
                                        className={`text-sm ${isRequired ? "text-mineshaft-200" : "cursor-pointer text-mineshaft-300"}`}
                                        label={label}
                                      />
                                      {isRequired && <span className="text-xs">(Required)</span>}
                                    </div>
                                  </div>
                                )}
                              />
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {filteredExtendedKeyUsages.length > 0 && (
                    <AccordionItem value="extended-key-usages">
                      <AccordionTrigger>Extended Key Usages</AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-2 gap-2 pl-2">
                          {filteredExtendedKeyUsages.map(({ label, value }) => {
                            const isRequired = requiredExtendedKeyUsages.includes(value);
                            return (
                              <Controller
                                key={label}
                                control={control}
                                name={`extendedKeyUsages.${value}` as any}
                                render={({ field }) => (
                                  <div className="flex items-center space-x-3">
                                    <Checkbox
                                      id={`ext-key-usage-${value}`}
                                      isChecked={field.value || false}
                                      onCheckedChange={(checked) => {
                                        if (!isRequired) {
                                          field.onChange(checked);
                                        }
                                      }}
                                      isDisabled={isRequired}
                                    />
                                    <div className="flex items-center gap-2">
                                      <FormLabel
                                        id={`ext-key-usage-${value}`}
                                        className={`text-sm ${isRequired ? "text-mineshaft-200" : "cursor-pointer text-mineshaft-300"}`}
                                        label={label}
                                      />
                                      {isRequired && <span className="text-xs">(Required)</span>}
                                    </div>
                                  </div>
                                )}
                              />
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </>
            )}

            <div className="mt-7 flex items-center">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={isSubmitting || (!selectedProfile && !profileId)}
              >
                {cert ? "Update" : "Issue Certificate"}
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => {
                  handlePopUpToggle("certificateIssuance", false);
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
