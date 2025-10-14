/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
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
  certKeyAlgorithms,
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS,
  SIGNATURE_ALGORITHMS_OPTIONS
} from "@app/hooks/api/certificates/constants";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage
} from "@app/hooks/api/certificates/enums";
import { useGetCertificateTemplateV2ById } from "@app/hooks/api/certificateTemplates/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "./CertificateContent";

const schema = z.object({
  profileId: z.string().min(1, "Profile is required"),
  subjectAttributes: z
    .array(
      z.object({
        type: z.enum(["common_name"]),
        value: z.string().min(1, "Value is required")
      })
    )
    .min(1, "At least one subject attribute is required"),
  subjectAltNames: z
    .array(
      z.object({
        type: z.enum(["dns", "ip", "email", "uri"]),
        value: z.string().min(1, "Value is required")
      })
    )
    .default([]),
  ttl: z.string().trim().min(1, "TTL is required"),
  signatureAlgorithm: z.string().optional(),
  keyAlgorithm: z.string().optional(),
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

export type FormData = z.infer<typeof schema>;

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
  const [allowedSignatureAlgorithms, setAllowedSignatureAlgorithms] = useState<string[]>([]);
  const [allowedKeyAlgorithms, setAllowedKeyAlgorithms] = useState<string[]>([]);
  const { currentProject } = useProject();
  const { data: cert } = useGetCert(
    (popUp?.certificateIssuance?.data as { serialNumber: string })?.serialNumber || ""
  );

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
    resolver: zodResolver(schema),
    defaultValues: {
      profileId: profileId ? profileId : "",
      subjectAttributes: [{ type: "common_name", value: "" }],
      subjectAltNames: [],
      ttl: "30d",
      signatureAlgorithm: "",
      keyAlgorithm: "",
      keyUsages: {},
      extendedKeyUsages: {}
    }
  });

  const selectedProfileId = watch("profileId");
  const selectedProfile = profilesData?.certificateProfiles?.find(
    (p) => p.id === selectedProfileId
  );

  const { data: templateData } = useGetCertificateTemplateV2ById({
    templateId: selectedProfile?.certificateTemplateId || ""
  });

  useEffect(() => {
    if (templateData && selectedProfile) {
      if (templateData.signatureAlgorithm?.allowedAlgorithms && templateData.signatureAlgorithm.allowedAlgorithms.length > 0) {
        const sigAlgMap: Record<string, string> = {
          "SHA256-RSA": "RSA-SHA256",
          "SHA384-RSA": "RSA-SHA384",
          "SHA512-RSA": "RSA-SHA512",
          "SHA256-ECDSA": "ECDSA-SHA256",
          "SHA384-ECDSA": "ECDSA-SHA384",
          "SHA512-ECDSA": "ECDSA-SHA512"
        };

        let defaultValue = templateData.signatureAlgorithm.defaultAlgorithm;
        if (defaultValue && sigAlgMap[defaultValue]) {
          defaultValue = sigAlgMap[defaultValue];
        }

        const allowedValues = templateData.signatureAlgorithm.allowedAlgorithms.map((alg: string) => sigAlgMap[alg] || alg);

        if (defaultValue && allowedValues.includes(defaultValue)) {
          setValue("signatureAlgorithm", defaultValue);
        } else if (allowedValues.length > 0) {
          setValue("signatureAlgorithm", allowedValues[0]);
        }
      }
      if (templateData.keyAlgorithm?.allowedKeyTypes && templateData.keyAlgorithm.allowedKeyTypes.length > 0) {
        const keyAlgMap: Record<string, string> = {
          "RSA-2048": CertKeyAlgorithm.RSA_2048,
          "RSA-3072": CertKeyAlgorithm.RSA_3072,
          "RSA-4096": CertKeyAlgorithm.RSA_4096,
          "ECDSA-P256": CertKeyAlgorithm.ECDSA_P256,
          "ECDSA-P384": CertKeyAlgorithm.ECDSA_P384,
          [CertKeyAlgorithm.ECDSA_P256]: CertKeyAlgorithm.ECDSA_P256,
          [CertKeyAlgorithm.ECDSA_P384]: CertKeyAlgorithm.ECDSA_P384
        };

        let defaultValue = templateData.keyAlgorithm.defaultKeyType;
        if (defaultValue && keyAlgMap[defaultValue]) {
          defaultValue = keyAlgMap[defaultValue];
        }

        const allowedValues = templateData.keyAlgorithm.allowedKeyTypes.map((alg: string) => keyAlgMap[alg] || alg);

        if (defaultValue && allowedValues.includes(defaultValue)) {
          setValue("keyAlgorithm", defaultValue);
        } else if (allowedValues.length > 0) {
          setValue("keyAlgorithm", allowedValues[0]);
        }
      }

      if (templateData.validity?.maxDuration) {
        const { value, unit } = templateData.validity.maxDuration;
        let ttlValue = "";

        switch (unit) {
          case "days":
            ttlValue = `${value}d`;
            break;
          case "months":
            ttlValue = `${value}m`;
            break;
          case "years":
            ttlValue = `${value}y`;
            break;
          default:
            ttlValue = `${value}d`;
        }

        setValue("ttl", ttlValue);
      }

      if (templateData.signatureAlgorithm?.allowedAlgorithms) {
        const mappedSigAlgs = templateData.signatureAlgorithm.allowedAlgorithms.map(
          (alg: string) => {
            const sigAlgMap: Record<string, string> = {
              "SHA256-RSA": "RSA-SHA256",
              "SHA384-RSA": "RSA-SHA384",
              "SHA512-RSA": "RSA-SHA512",
              "SHA256-ECDSA": "ECDSA-SHA256",
              "SHA384-ECDSA": "ECDSA-SHA384",
              "SHA512-ECDSA": "ECDSA-SHA512"
            };
            return sigAlgMap[alg] || alg;
          }
        );
        setAllowedSignatureAlgorithms(mappedSigAlgs);
      }

      if (templateData.keyAlgorithm?.allowedKeyTypes) {
        const mappedKeyAlgs = templateData.keyAlgorithm.allowedKeyTypes.map((alg: string) => {
          const keyAlgMap: Record<string, string> = {
            "RSA-2048": CertKeyAlgorithm.RSA_2048,
            "RSA-3072": CertKeyAlgorithm.RSA_3072,
            "RSA-4096": CertKeyAlgorithm.RSA_4096,
            "ECDSA-P256": CertKeyAlgorithm.ECDSA_P256,
            "ECDSA-P384": CertKeyAlgorithm.ECDSA_P384
          };
          return keyAlgMap[alg] || alg;
        });
        setAllowedKeyAlgorithms(mappedKeyAlgs);
      }

      const allAllowedKeyUsages: string[] = [];
      if (templateData.keyUsages?.requiredUsages?.all) {
        allAllowedKeyUsages.push(...templateData.keyUsages.requiredUsages.all);
      }
      if (templateData.keyUsages?.optionalUsages?.all) {
        allAllowedKeyUsages.push(...templateData.keyUsages.optionalUsages.all);
      }
      setAllowedKeyUsages([...new Set(allAllowedKeyUsages)]);

      const allAllowedExtendedKeyUsages: string[] = [];
      if (templateData.extendedKeyUsages?.requiredUsages?.all) {
        allAllowedExtendedKeyUsages.push(...templateData.extendedKeyUsages.requiredUsages.all);
      }
      if (templateData.extendedKeyUsages?.optionalUsages?.all) {
        allAllowedExtendedKeyUsages.push(...templateData.extendedKeyUsages.optionalUsages.all);
      }
      setAllowedExtendedKeyUsages([...new Set(allAllowedExtendedKeyUsages)]);

      if (templateData.attributes && Array.isArray(templateData.attributes)) {
        const subjectAttrs: Array<{
          type: "common_name";
          value: string;
        }> = [];

        templateData.attributes.forEach((attr) => {
          if (
            (attr.include === "mandatory" ||
              attr.include === "optional" ||
              attr.include === "prohibit") &&
            attr.value &&
            attr.value.length > 0
          ) {
            attr.value.forEach((val: string) => {
              subjectAttrs.push({ type: attr.type as any, value: val });
            });
          }
        });

        if (subjectAttrs.length > 0) {
          setValue("subjectAttributes", subjectAttrs);
        } else {
          setValue("subjectAttributes", [{ type: "common_name", value: "" }]);
        }
      }

      if (
        templateData.subjectAlternativeNames &&
        Array.isArray(templateData.subjectAlternativeNames)
      ) {
        const templateSans: Array<{ type: "dns" | "ip" | "email" | "uri"; value: string }> = [];

        templateData.subjectAlternativeNames.forEach((sanPolicy) => {
          if (
            (sanPolicy.include === "mandatory" ||
              sanPolicy.include === "optional" ||
              sanPolicy.include === "prohibit") &&
            sanPolicy.value &&
            sanPolicy.value.length > 0
          ) {
            const typeMapping: Record<string, "dns" | "ip" | "email" | "uri"> = {
              dns_name: "dns",
              ip_address: "ip",
              email: "email",
              uri: "uri"
            };

            const mappedType = typeMapping[sanPolicy.type];
            if (mappedType) {
              sanPolicy.value.forEach((val: string) => {
                templateSans.push({ type: mappedType, value: val });
              });
            }
          }
        });

        if (templateSans.length > 0) {
          setValue("subjectAltNames", templateSans);
        }
      }

      const resetKeyUsages = {
        [CertKeyUsage.DIGITAL_SIGNATURE]: false,
        [CertKeyUsage.KEY_ENCIPHERMENT]: false,
        [CertKeyUsage.NON_REPUDIATION]: false,
        [CertKeyUsage.DATA_ENCIPHERMENT]: false,
        [CertKeyUsage.KEY_AGREEMENT]: false,
        [CertKeyUsage.KEY_CERT_SIGN]: false,
        [CertKeyUsage.CRL_SIGN]: false,
        [CertKeyUsage.ENCIPHER_ONLY]: false,
        [CertKeyUsage.DECIPHER_ONLY]: false
      };

      const resetExtendedKeyUsages = {
        [CertExtendedKeyUsage.CLIENT_AUTH]: false,
        [CertExtendedKeyUsage.CODE_SIGNING]: false,
        [CertExtendedKeyUsage.EMAIL_PROTECTION]: false,
        [CertExtendedKeyUsage.OCSP_SIGNING]: false,
        [CertExtendedKeyUsage.SERVER_AUTH]: false,
        [CertExtendedKeyUsage.TIMESTAMPING]: false
      };

      const templateToEnumMap = {
        digital_signature: CertKeyUsage.DIGITAL_SIGNATURE,
        digitalSignature: CertKeyUsage.DIGITAL_SIGNATURE,
        key_encipherment: CertKeyUsage.KEY_ENCIPHERMENT,
        keyEncipherment: CertKeyUsage.KEY_ENCIPHERMENT,
        non_repudiation: CertKeyUsage.NON_REPUDIATION,
        nonRepudiation: CertKeyUsage.NON_REPUDIATION,
        data_encipherment: CertKeyUsage.DATA_ENCIPHERMENT,
        dataEncipherment: CertKeyUsage.DATA_ENCIPHERMENT,
        key_agreement: CertKeyUsage.KEY_AGREEMENT,
        keyAgreement: CertKeyUsage.KEY_AGREEMENT,
        key_cert_sign: CertKeyUsage.KEY_CERT_SIGN,
        keyCertSign: CertKeyUsage.KEY_CERT_SIGN,
        crl_sign: CertKeyUsage.CRL_SIGN,
        cRLSign: CertKeyUsage.CRL_SIGN,
        encipher_only: CertKeyUsage.ENCIPHER_ONLY,
        encipherOnly: CertKeyUsage.ENCIPHER_ONLY,
        decipher_only: CertKeyUsage.DECIPHER_ONLY,
        decipherOnly: CertKeyUsage.DECIPHER_ONLY,
        client_auth: CertExtendedKeyUsage.CLIENT_AUTH,
        clientAuth: CertExtendedKeyUsage.CLIENT_AUTH,
        server_auth: CertExtendedKeyUsage.SERVER_AUTH,
        serverAuth: CertExtendedKeyUsage.SERVER_AUTH,
        code_signing: CertExtendedKeyUsage.CODE_SIGNING,
        codeSigning: CertExtendedKeyUsage.CODE_SIGNING,
        email_protection: CertExtendedKeyUsage.EMAIL_PROTECTION,
        emailProtection: CertExtendedKeyUsage.EMAIL_PROTECTION,
        ocsp_signing: CertExtendedKeyUsage.OCSP_SIGNING,
        ocspSigning: CertExtendedKeyUsage.OCSP_SIGNING,
        time_stamping: CertExtendedKeyUsage.TIMESTAMPING,
        timestamping: CertExtendedKeyUsage.TIMESTAMPING,
        timeStamping: CertExtendedKeyUsage.TIMESTAMPING
      };

      const currentKeyUsages = { ...resetKeyUsages };
      if (templateData.keyUsages?.requiredUsages?.all) {
        templateData.keyUsages.requiredUsages.all.forEach((usage: string) => {
          const enumValue = (templateToEnumMap as any)[usage];
          if (enumValue && enumValue in currentKeyUsages) {
            (currentKeyUsages as any)[enumValue] = true;
          }
        });
      }

      const currentExtendedKeyUsages = { ...resetExtendedKeyUsages };
      if (templateData.extendedKeyUsages?.requiredUsages?.all) {
        templateData.extendedKeyUsages.requiredUsages.all.forEach((usage: string) => {
          const enumValue = (templateToEnumMap as any)[usage];
          if (enumValue && enumValue in currentExtendedKeyUsages) {
            (currentExtendedKeyUsages as any)[enumValue] = true;
          }
        });
      }

      setValue("keyUsages", currentKeyUsages);
      setValue("extendedKeyUsages", currentExtendedKeyUsages);
    }
  }, [templateData, selectedProfile, setValue]);

  useEffect(() => {
    if (cert) {
      const subjectAttrs: Array<{ type: string; value: string }> = [];
      if (cert.commonName) subjectAttrs.push({ type: "common_name", value: cert.commonName });

      reset({
        profileId: "",
        subjectAttributes:
          subjectAttrs.length > 0
            ? (subjectAttrs as any)
            : [{ type: "common_name" as const, value: "" }],
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

  const onFormSubmit = async ({
    profileId,
    subjectAttributes,
    subjectAltNames,
    ttl,
    signatureAlgorithm,
    keyAlgorithm,
    keyUsages,
    extendedKeyUsages
  }: FormData) => {
    try {
      if (!currentProject?.slug) return;

      const getAttributeValue = (type: string) => {
        const foundAttr = subjectAttributes.find((attr) => attr.type === type);
        return foundAttr?.value || "";
      };

      const { serialNumber, certificate, certificateChain, privateKey } = await createCertificate({
        profileId,
        projectSlug: currentProject.slug,
        commonName: getAttributeValue("common_name"),
        subjectAltNames: subjectAltNames
          .filter((san) => san.value.trim())
          .map((san) => san.value.trim())
          .join(", "),
        ttl,
        signatureAlgorithm: (() => {
          const frontendToBackendSigAlg: Record<string, string> = {
            "RSA-SHA256": "RSA-SHA256",
            "RSA-SHA384": "RSA-SHA384",
            "RSA-SHA512": "RSA-SHA512",
            "ECDSA-SHA256": "ECDSA-SHA256",
            "ECDSA-SHA384": "ECDSA-SHA384",
            "ECDSA-SHA512": "ECDSA-SHA512"
          };
          return signatureAlgorithm
            ? frontendToBackendSigAlg[signatureAlgorithm] || signatureAlgorithm
            : undefined;
        })(),
        keyAlgorithm: (() => {
          const frontendToBackendKeyAlg: Record<string, string> = {
            RSA_2048: "RSA_2048",
            RSA_3072: "RSA_3072",
            RSA_4096: "RSA_4096",
            EC_prime256v1: "EC_prime256v1",
            EC_secp384r1: "EC_secp384r1"
          };
          return keyAlgorithm ? frontendToBackendKeyAlg[keyAlgorithm] || keyAlgorithm : undefined;
        })(),
        keyUsages: Object.entries(keyUsages)
          .filter(([, value]) => value)
          .map(([key]) => key as CertKeyUsage),
        extendedKeyUsages: Object.entries(extendedKeyUsages)
          .filter(([, value]) => value)
          .map(([key]) => key as CertExtendedKeyUsage)
      });

      reset();

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
      console.error(err);
      createNotification({
        text: "Failed to create certificate",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.certificateIssuance?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificateIssuance", isOpen);
        setCertificateDetails(null);
        reset();
      }}
    >
      <ModalContent
        title={
          certificateDetails
            ? "Certificate Created Successfully"
            : cert
              ? "Certificate Details"
              : "Issue New Certificate"
        }
        subTitle={
          certificateDetails
            ? "Certificate has been successfully created and is ready for use"
            : cert
              ? "View certificate information"
              : "Issue a new certificate using a certificate profile"
        }
      >
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
              <h4 className="text-mineshaft-300 text-sm font-medium">Certificate Details</h4>
              <p className="text-mineshaft-400 text-sm">Serial Number: {cert.serialNumber}</p>
              <p className="text-mineshaft-400 text-sm">Common Name: {cert.commonName}</p>
              <p className="text-mineshaft-400 text-sm">Status: {cert.status}</p>
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
                                  Certificate profiles define the policies and enrollment methods for
                                  certificate issuance. The selected profile will enforce validation
                                  rules and determine the CA used for signing.
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
                        {value.map((attr, index) => (
                          <div key={`attr-${index}`} className="flex items-start gap-2">
                            <Select
                              value={attr.type}
                              onValueChange={(newType) => {
                                const newValue = [...value];
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
                                const newValue = [...value];
                                newValue[index] = { ...attr, value: e.target.value };
                                onChange(newValue);
                              }}
                              placeholder="example.com"
                              className="flex-1"
                            />
                            {value.length > 1 && (
                              <IconButton
                                ariaLabel="Remove Subject Attribute"
                                variant="plain"
                                size="sm"
                                onClick={() => {
                                  const newValue = value.filter((_, i) => i !== index);
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
                            onChange([...value, { type: "common_name", value: "" }]);
                          }}
                          className="w-full"
                        >
                          Add Subject Attribute
                        </Button>
                      </div>
                    </FormControl>
                  )}
                />

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
                          <div key={`san-${index}`} className="flex items-start gap-2">
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
                              <SelectItem value="dns">DNS</SelectItem>
                              <SelectItem value="ip">IP</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="uri">URI</SelectItem>
                            </Select>
                            <Input
                              value={san.value}
                              onChange={(e) => {
                                const newValue = [...value];
                                newValue[index] = { ...san, value: e.target.value };
                                onChange(newValue);
                              }}
                              placeholder={
                                san.type === "dns"
                                  ? "example.com or *.example.com"
                                  : san.type === "ip"
                                    ? "192.168.1.1"
                                    : san.type === "email"
                                      ? "admin@example.com"
                                      : "https://example.com"
                              }
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
                            onChange([...value, { type: "dns", value: "" }]);
                          }}
                          className="w-full"
                        >
                          Add SAN
                        </Button>
                      </div>
                    </FormControl>
                  )}
                />

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
                            placeholder="Use template default"
                            position="popper"
                          >
                            {SIGNATURE_ALGORITHMS_OPTIONS.filter((algorithm) => {
                              if (allowedSignatureAlgorithms.length === 0) return true;
                              return allowedSignatureAlgorithms.includes(algorithm.value);
                            }).map((algorithm) => (
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
                            placeholder="Use template default"
                            position="popper"
                          >
                            {certKeyAlgorithms
                              .filter((algorithm) => {
                                if (allowedKeyAlgorithms.length === 0) return true;
                                return allowedKeyAlgorithms.includes(algorithm.value);
                              })
                              .map((algorithm) => (
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
                  <AccordionItem value="key-usages">
                    <AccordionTrigger>Key Usages</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-2 pl-2">
                        {KEY_USAGES_OPTIONS.filter(({ value }) => {
                          if (allowedKeyUsages.length === 0) return true;
                          const templateToEnumMap = {
                            digital_signature: CertKeyUsage.DIGITAL_SIGNATURE,
                            key_encipherment: CertKeyUsage.KEY_ENCIPHERMENT,
                            non_repudiation: CertKeyUsage.NON_REPUDIATION,
                            data_encipherment: CertKeyUsage.DATA_ENCIPHERMENT,
                            key_agreement: CertKeyUsage.KEY_AGREEMENT,
                            key_cert_sign: CertKeyUsage.KEY_CERT_SIGN,
                            crl_sign: CertKeyUsage.CRL_SIGN,
                            encipher_only: CertKeyUsage.ENCIPHER_ONLY,
                            decipher_only: CertKeyUsage.DECIPHER_ONLY
                          };
                          return allowedKeyUsages.some(
                            (allowedUsage) => (templateToEnumMap as any)[allowedUsage] === value
                          );
                        }).map(({ label, value }) => (
                          <Controller
                            key={label}
                            control={control}
                            name={`keyUsages.${value}` as any}
                            render={({ field }) => (
                              <div className="flex items-center space-x-3">
                                <Checkbox
                                  id={`key-usage-${value}`}
                                  isChecked={field.value || false}
                                  onCheckedChange={(checked) => field.onChange(checked)}
                                />
                                <FormLabel
                                  id={`key-usage-${value}`}
                                  className="text-mineshaft-300 cursor-pointer text-sm"
                                  label={label}
                                />
                              </div>
                            )}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="extended-key-usages">
                    <AccordionTrigger>Extended Key Usages</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-2 pl-2">
                        {EXTENDED_KEY_USAGES_OPTIONS.filter(({ value }) => {
                          if (allowedExtendedKeyUsages.length === 0) return true;
                          const templateToEnumMap = {
                            client_auth: CertExtendedKeyUsage.CLIENT_AUTH,
                            server_auth: CertExtendedKeyUsage.SERVER_AUTH,
                            code_signing: CertExtendedKeyUsage.CODE_SIGNING,
                            email_protection: CertExtendedKeyUsage.EMAIL_PROTECTION,
                            ocsp_signing: CertExtendedKeyUsage.OCSP_SIGNING,
                            time_stamping: CertExtendedKeyUsage.TIMESTAMPING,
                            timestamping: CertExtendedKeyUsage.TIMESTAMPING
                          };
                          return allowedExtendedKeyUsages.some(
                            (allowedUsage) => (templateToEnumMap as any)[allowedUsage] === value
                          );
                        }).map(({ label, value }) => (
                          <Controller
                            key={label}
                            control={control}
                            name={`extendedKeyUsages.${value}` as any}
                            render={({ field }) => (
                              <div className="flex items-center space-x-3">
                                <Checkbox
                                  id={`ext-key-usage-${value}`}
                                  isChecked={field.value || false}
                                  onCheckedChange={(checked) => field.onChange(checked)}
                                />
                                <FormLabel
                                  id={`ext-key-usage-${value}`}
                                  className="text-mineshaft-300 cursor-pointer text-sm"
                                  label={label}
                                />
                              </div>
                            )}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
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
                onClick={() => handlePopUpToggle("certificateIssuance", false)}
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
