import { useEffect, useMemo, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { AppConnectionOption } from "@app/components/app-connections";
import { createNotification } from "@app/components/notifications";
import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared/AwsRegionSelect";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useProject } from "@app/context";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  TAvailableAppConnection,
  useListAvailableAppConnections
} from "@app/hooks/api/appConnections";
import {
  TAzureDNSZone,
  useAzureDNSConnectionListZones
} from "@app/hooks/api/appConnections/azure-dns";
import {
  TCloudflareZone,
  useCloudflareConnectionListZones
} from "@app/hooks/api/appConnections/cloudflare";
import {
  TDigiCertOrganization,
  TDigiCertProduct,
  useDigiCertConnectionCodeSigningValidation,
  useDigiCertConnectionListOrganizations,
  useDigiCertConnectionListProducts
} from "@app/hooks/api/appConnections/digicert";
import {
  TDNSMadeEasyZone,
  useDNSMadeEasyConnectionListZones
} from "@app/hooks/api/appConnections/dns-made-easy";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  AcmeDnsProvider,
  CaStatus,
  CaType,
  GoDaddyProductType,
  useCreateCa,
  useGetCa,
  useUpdateCa
} from "@app/hooks/api/ca";
import {
  ACME_DNS_PROVIDER_APP_CONNECTION_MAP,
  ACME_DNS_PROVIDER_NAME_MAP
} from "@app/hooks/api/ca/constants";
import { DigiCertCaPurpose } from "@app/hooks/api/ca/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

const UNCHANGED_CREDENTIAL_SENTINEL = "__INFISICAL_UNCHANGED__";

const REQUIRED_EAB_DIRECTORIES = [
  "https://acme.digicert.com/v2/acme/directory",
  "https://acme.zerossl.com/v2/DV90",
  "https://acme.ssl.com/sslcom-dv-rsa",
  "https://acme.ssl.com/sslcom-dv-ecc",
  "https://dv.acme-v02.api.pki.goog/directory",
  "https://acme.sectigo.com/v2/OV",
  "https://acme.sectigo.com/v2/EV",
  "https://acme.cisco.com/ACMEv2/directory"
];

const baseSchema = z.object({
  type: z.nativeEnum(CaType),
  name: slugSchema({
    field: "Name"
  }),
  status: z.nativeEnum(CaStatus)
});

const acmeConfigurationSchema = z
  .object({
    dnsAppConnection: z.object({
      id: z.string(),
      name: z.string()
    }),
    dnsProviderConfig: z.object({
      provider: z.nativeEnum(AcmeDnsProvider),
      hostedZoneId: z.string()
    }),
    directoryUrl: z.string(),
    accountEmail: z.string(),
    eabKid: z.string().optional(),
    eabHmacKey: z.string().optional(),
    dnsResolver: z
      .string()
      .ip({ message: "Must be a valid IP address" })
      .or(z.literal(""))
      .optional()
  })
  .superRefine((data, ctx) => {
    if (REQUIRED_EAB_DIRECTORIES.includes(data.directoryUrl)) {
      if (!data.eabKid || data.eabKid.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "EAB Key Identifier (KID) is required for this directory URL",
          path: ["eabKid"]
        });
      }
    }
  });

const azureAdCsConfigurationSchema = z.object({
  azureAdcsConnection: z.object({
    id: z.string(),
    name: z.string()
  })
});

const awsPcaConfigurationSchema = z.object({
  awsConnection: z.object({
    id: z.string().min(1, "AWS Connection is required"),
    name: z.string()
  }),
  certificateAuthorityArn: z.string().trim().min(1, "Certificate Authority ARN is required"),
  region: z.string().min(1, "Region is required")
});

const digicertConfigurationSchema = z
  .object({
    digicertConnection: z.object({
      id: z.string().min(1, "DigiCert Connection is required"),
      name: z.string()
    }),
    organizationId: z.coerce.number().int().positive("Organization is required"),
    productNameId: z.string().trim().min(1, "Product is required"),
    purpose: z.nativeEnum(DigiCertCaPurpose).optional(),
    // UI-only flag (not sent): true when the org isn't code-signing validated yet, so a contact is required.
    csRequiresContact: z.boolean().optional(),
    verifiedContact: z
      .object({
        firstName: z.string().trim().max(128).optional(),
        lastName: z.string().trim().max(128).optional(),
        email: z.string().trim().max(255).optional(),
        jobTitle: z.string().trim().max(64).optional(),
        telephone: z.string().trim().max(32).optional()
      })
      .optional()
  })
  .superRefine((cfg, ctx) => {
    if (cfg.purpose !== DigiCertCaPurpose.CodeSigning || !cfg.csRequiresContact) return;
    const c = cfg.verifiedContact;
    const requiredFields: { key: keyof NonNullable<typeof c>; label: string }[] = [
      { key: "firstName", label: "First Name" },
      { key: "lastName", label: "Last Name" },
      { key: "email", label: "Email" },
      { key: "jobTitle", label: "Job Title" },
      { key: "telephone", label: "Telephone" }
    ];
    requiredFields.forEach(({ key, label }) => {
      if (!c?.[key] || c[key]?.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["verifiedContact", key],
          message: `${label} is required for code signing CAs`
        });
      }
    });
    if (c?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verifiedContact", "email"],
        message: "Email must be valid"
      });
    }
  });

const awsAcmPublicCaConfigurationSchema = z.object({
  awsConnection: z.object({
    id: z.string().min(1, "AWS Connection is required"),
    name: z.string()
  }),
  dnsConnection: z.object({
    id: z.string().min(1, "Route 53 Connection is required"),
    name: z.string()
  }),
  hostedZoneId: z.string().trim().min(1, "Hosted Zone ID is required"),
  region: z.string().min(1, "Region is required")
});

const venafiTppConfigurationSchema = z.object({
  venafiTppConnection: z.object({
    id: z.string().min(1, "Venafi TPP Connection is required"),
    name: z.string()
  }),
  policyDN: z.string().trim().min(1, "Policy DN is required")
});

const godaddyConfigurationSchema = z.object({
  godaddyConnection: z.object({
    id: z.string().min(1, "GoDaddy Connection is required"),
    name: z.string()
  }),
  productType: z.nativeEnum(GoDaddyProductType)
});

const schema = z.discriminatedUnion("type", [
  baseSchema.extend({
    type: z.literal(CaType.ACME),
    configuration: acmeConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.AZURE_AD_CS),
    configuration: azureAdCsConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.AWS_PCA),
    configuration: awsPcaConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.DIGICERT),
    configuration: digicertConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.AWS_ACM_PUBLIC_CA),
    configuration: awsAcmPublicCaConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.VENAFI_TPP),
    configuration: venafiTppConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.GODADDY),
    configuration: godaddyConfigurationSchema
  })
]);

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["ca"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["ca"]>, state?: boolean) => void;
};

const caTypes = [
  { label: "ACME", value: CaType.ACME },
  { label: "Active Directory Certificate Services (AD CS)", value: CaType.AZURE_AD_CS },
  { label: "AWS Private CA (PCA)", value: CaType.AWS_PCA },
  { label: "AWS ACM Public CA", value: CaType.AWS_ACM_PUBLIC_CA },
  { label: "DigiCert CertCentral", value: CaType.DIGICERT },
  { label: "Venafi TPP", value: CaType.VENAFI_TPP },
  { label: "GoDaddy", value: CaType.GODADDY }
];

export const ExternalCaModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();

  const { data: ca, isLoading: isCaLoading } = useGetCa({
    caId: (popUp?.ca?.data as { caId: string })?.caId || "",
    type: (popUp?.ca?.data as { type: CaType })?.type || ""
  });

  const { mutateAsync: createMutateAsync } = useCreateCa();
  const { mutateAsync: updateMutateAsync } = useUpdateCa();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch,
    setValue
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const caType = watch("type");
  const configuration = watch("configuration");
  const dnsProvider =
    caType === CaType.ACME && configuration && "dnsProviderConfig" in configuration
      ? configuration.dnsProviderConfig.provider
      : undefined;
  const directoryUrl =
    caType === CaType.ACME && configuration && "directoryUrl" in configuration
      ? configuration.directoryUrl
      : undefined;

  useEffect(() => {
    const initialType = (popUp?.ca?.data as { type: CaType })?.type;
    if (!ca && popUp?.ca?.isOpen) {
      if (initialType === CaType.AZURE_AD_CS) {
        reset({
          type: CaType.AZURE_AD_CS,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            azureAdcsConnection: {
              id: "",
              name: ""
            }
          }
        });
      } else if (initialType === CaType.AWS_PCA) {
        reset({
          type: CaType.AWS_PCA,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            awsConnection: {
              id: "",
              name: ""
            },
            certificateAuthorityArn: "",
            region: ""
          }
        });
      } else if (initialType === CaType.DIGICERT) {
        reset({
          type: CaType.DIGICERT,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            digicertConnection: {
              id: "",
              name: ""
            },
            organizationId: 0,
            productNameId: "",
            purpose: DigiCertCaPurpose.Ssl,
            verifiedContact: undefined
          }
        });
      } else if (initialType === CaType.AWS_ACM_PUBLIC_CA) {
        reset({
          type: CaType.AWS_ACM_PUBLIC_CA,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            awsConnection: {
              id: "",
              name: ""
            },
            dnsConnection: {
              id: "",
              name: ""
            },
            hostedZoneId: "",
            region: ""
          }
        });
      } else if (initialType === CaType.VENAFI_TPP) {
        reset({
          type: CaType.VENAFI_TPP,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            venafiTppConnection: {
              id: "",
              name: ""
            },
            policyDN: ""
          }
        });
      } else if (initialType === CaType.GODADDY) {
        reset({
          type: CaType.GODADDY,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            godaddyConnection: {
              id: "",
              name: ""
            },
            productType: GoDaddyProductType.DV_SSL
          }
        });
      } else {
        reset({
          type: CaType.ACME,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            dnsAppConnection: {
              id: "",
              name: ""
            },
            dnsProviderConfig: {
              provider: AcmeDnsProvider.ROUTE53,
              hostedZoneId: ""
            },
            directoryUrl: "",
            accountEmail: "",
            eabKid: "",
            eabHmacKey: "",
            dnsResolver: ""
          }
        });
      }
    }
  }, [popUp?.ca?.isOpen, popUp?.ca?.data, reset, ca]);

  const { data: availableRoute53Connections, isPending: isRoute53Pending } =
    useListAvailableAppConnections(AppConnection.AWS, currentProject.id, {
      enabled: caType === CaType.ACME
    });

  const { data: availableCloudflareConnections, isPending: isCloudflarePending } =
    useListAvailableAppConnections(AppConnection.Cloudflare, currentProject.id, {
      enabled: caType === CaType.ACME
    });

  const { data: availableDNSMadeEasyConnections, isPending: isDNSMadeEasyPending } =
    useListAvailableAppConnections(AppConnection.DNSMadeEasy, currentProject.id, {
      enabled: caType === CaType.ACME
    });

  const { data: availableAzureDNSConnections, isPending: isAzureDNSPending } =
    useListAvailableAppConnections(AppConnection.AzureDNS, currentProject.id, {
      enabled: caType === CaType.ACME
    });

  const { data: availableAzureConnections, isPending: isAzurePending } =
    useListAvailableAppConnections(AppConnection.AzureADCS, currentProject.id, {
      enabled: caType === CaType.AZURE_AD_CS
    });

  const { data: availableAwsConnections, isPending: isAwsPending } = useListAvailableAppConnections(
    AppConnection.AWS,
    currentProject.id,
    {
      enabled: caType === CaType.AWS_PCA || caType === CaType.AWS_ACM_PUBLIC_CA
    }
  );

  const { data: availableDigiCertConnections, isPending: isDigiCertPending } =
    useListAvailableAppConnections(AppConnection.DigiCert, currentProject.id, {
      enabled: caType === CaType.DIGICERT
    });

  const { data: availableVenafiTppConnections, isPending: isVenafiTppPending } =
    useListAvailableAppConnections(AppConnection.VenafiTpp, currentProject.id, {
      enabled: caType === CaType.VENAFI_TPP
    });

  const { data: availableGoDaddyConnections, isPending: isGoDaddyPending } =
    useListAvailableAppConnections(AppConnection.GoDaddy, currentProject.id, {
      enabled: caType === CaType.GODADDY
    });

  const availableConnections: TAvailableAppConnection[] = useMemo(() => {
    if (caType === CaType.AZURE_AD_CS) {
      return availableAzureConnections || [];
    }
    if (caType === CaType.AWS_PCA || caType === CaType.AWS_ACM_PUBLIC_CA) {
      return availableAwsConnections || [];
    }
    if (caType === CaType.DIGICERT) {
      return availableDigiCertConnections || [];
    }
    if (caType === CaType.VENAFI_TPP) {
      return availableVenafiTppConnections || [];
    }
    if (caType === CaType.GODADDY) {
      return availableGoDaddyConnections || [];
    }
    return [
      ...(availableRoute53Connections || []),
      ...(availableCloudflareConnections || []),
      ...(availableDNSMadeEasyConnections || []),
      ...(availableAzureDNSConnections || [])
    ];
  }, [
    caType,
    availableRoute53Connections,
    availableCloudflareConnections,
    availableDNSMadeEasyConnections,
    availableAzureDNSConnections,
    availableAzureConnections,
    availableAwsConnections,
    availableDigiCertConnections,
    availableVenafiTppConnections,
    availableGoDaddyConnections
  ]);

  const isPending =
    isRoute53Pending ||
    isCloudflarePending ||
    isDNSMadeEasyPending ||
    isAzureDNSPending ||
    (isAzurePending && caType === CaType.AZURE_AD_CS) ||
    (isAwsPending && (caType === CaType.AWS_PCA || caType === CaType.AWS_ACM_PUBLIC_CA)) ||
    (isDigiCertPending && caType === CaType.DIGICERT) ||
    (isVenafiTppPending && caType === CaType.VENAFI_TPP) ||
    (isGoDaddyPending && caType === CaType.GODADDY);

  const dnsAppConnection =
    caType === CaType.ACME && configuration && "dnsAppConnection" in configuration
      ? configuration.dnsAppConnection
      : { id: "", name: "" };

  const { data: cloudflareZones = [], isPending: isZonesPending } =
    useCloudflareConnectionListZones(dnsAppConnection.id, {
      enabled: dnsProvider === AcmeDnsProvider.Cloudflare && !!dnsAppConnection.id
    });

  const { data: dnsMadeEasyZones = [], isPending: isDNSMadeEasyZonesPending } =
    useDNSMadeEasyConnectionListZones(dnsAppConnection.id, {
      enabled: dnsProvider === AcmeDnsProvider.DNSMadeEasy && !!dnsAppConnection.id
    });

  const { data: azureDnsZones = [], isPending: isAzureDNSZonesPending } =
    useAzureDNSConnectionListZones(dnsAppConnection.id, {
      enabled: dnsProvider === AcmeDnsProvider.AzureDNS && !!dnsAppConnection.id
    });

  // Populate form with CA data when editing
  useEffect(() => {
    if (ca && !isCaLoading) {
      if (ca.type === CaType.ACME && availableConnections?.length) {
        const selectedConnection = availableConnections?.find(
          (connection) => connection.id === ca.configuration.dnsAppConnectionId
        );

        reset({
          type: ca.type,
          name: ca.name,
          status: ca.status,
          configuration: {
            dnsAppConnection: {
              id: ca.configuration.dnsAppConnectionId,
              name: selectedConnection?.name || ""
            },
            dnsProviderConfig: {
              provider: ca.configuration.dnsProviderConfig.provider,
              hostedZoneId: ca.configuration.dnsProviderConfig.hostedZoneId
            },
            directoryUrl: ca.configuration.directoryUrl,
            accountEmail: ca.configuration.accountEmail,
            eabKid: ca.configuration.eabKid,
            eabHmacKey: UNCHANGED_CREDENTIAL_SENTINEL,
            dnsResolver: ca.configuration.dnsResolver || ""
          }
        });
      } else if (ca.type === CaType.AZURE_AD_CS && availableConnections?.length) {
        const selectedConnection = availableConnections?.find(
          (connection) => connection.id === ca.configuration.azureAdcsConnectionId
        );

        reset({
          type: ca.type,
          name: ca.name,
          status: ca.status,
          configuration: {
            azureAdcsConnection: {
              id: ca.configuration.azureAdcsConnectionId,
              name: selectedConnection?.name || ""
            }
          }
        });
      } else if (ca.type === CaType.AWS_PCA && availableConnections?.length) {
        const selectedConnection = availableConnections?.find(
          (connection) => connection.id === ca.configuration.appConnectionId
        );

        reset({
          type: ca.type,
          name: ca.name,
          status: ca.status,
          configuration: {
            awsConnection: {
              id: ca.configuration.appConnectionId,
              name: selectedConnection?.name || ""
            },
            certificateAuthorityArn: ca.configuration.certificateAuthorityArn,
            region: ca.configuration.region
          }
        });
      } else if (ca.type === CaType.DIGICERT && availableConnections?.length) {
        const selectedConnection = availableConnections?.find(
          (connection) => connection.id === ca.configuration.appConnectionId
        );

        reset({
          type: ca.type,
          name: ca.name,
          status: ca.status,
          configuration: {
            digicertConnection: {
              id: ca.configuration.appConnectionId,
              name: selectedConnection?.name || ""
            },
            organizationId: ca.configuration.organizationId,
            productNameId: ca.configuration.productNameId,
            purpose: ca.configuration.purpose ?? DigiCertCaPurpose.Ssl,
            verifiedContact: ca.configuration.verifiedContact
          }
        });
      } else if (ca.type === CaType.AWS_ACM_PUBLIC_CA && availableConnections?.length) {
        const selectedConnection = availableConnections?.find(
          (connection) => connection.id === ca.configuration.appConnectionId
        );
        const selectedDnsConnection = ca.configuration.dnsAppConnectionId
          ? availableConnections?.find(
              (connection) => connection.id === ca.configuration.dnsAppConnectionId
            )
          : undefined;

        reset({
          type: ca.type,
          name: ca.name,
          status: ca.status,
          configuration: {
            awsConnection: {
              id: ca.configuration.appConnectionId,
              name: selectedConnection?.name || ""
            },
            dnsConnection: ca.configuration.dnsAppConnectionId
              ? {
                  id: ca.configuration.dnsAppConnectionId,
                  name: selectedDnsConnection?.name || ""
                }
              : undefined,
            hostedZoneId: ca.configuration.hostedZoneId || "",
            region: ca.configuration.region
          }
        });
      } else if (ca.type === CaType.VENAFI_TPP && availableConnections?.length) {
        const selectedConnection = availableConnections?.find(
          (connection) => connection.id === ca.configuration.appConnectionId
        );

        reset({
          type: ca.type,
          name: ca.name,
          status: ca.status,
          configuration: {
            venafiTppConnection: {
              id: ca.configuration.appConnectionId,
              name: selectedConnection?.name || ""
            },
            policyDN: ca.configuration.policyDN
          }
        });
      } else if (ca.type === CaType.GODADDY && availableConnections?.length) {
        const selectedConnection = availableConnections?.find(
          (connection) => connection.id === ca.configuration.appConnectionId
        );

        reset({
          type: ca.type,
          name: ca.name,
          status: ca.status,
          configuration: {
            godaddyConnection: {
              id: ca.configuration.appConnectionId,
              name: selectedConnection?.name || ""
            },
            productType: ca.configuration.productType
          }
        });
      }
    }
  }, [ca, availableConnections, reset, isCaLoading]);

  const digicertConnectionId =
    caType === CaType.DIGICERT && configuration && "digicertConnection" in configuration
      ? (configuration.digicertConnection?.id ?? "")
      : "";

  const { data: digicertOrganizations = [], isPending: isDigiCertOrgsPending } =
    useDigiCertConnectionListOrganizations(digicertConnectionId, {
      enabled: caType === CaType.DIGICERT && !!digicertConnectionId
    });

  const { data: digicertProducts = [], isPending: isDigiCertProductsPending } =
    useDigiCertConnectionListProducts(digicertConnectionId, {
      enabled: caType === CaType.DIGICERT && !!digicertConnectionId
    });

  const digicertOrganizationId =
    caType === CaType.DIGICERT && configuration && "organizationId" in configuration
      ? (configuration.organizationId ?? 0)
      : 0;
  const digicertProductNameId =
    caType === CaType.DIGICERT && configuration && "productNameId" in configuration
      ? (configuration.productNameId ?? "")
      : "";
  const digicertPurpose =
    caType === CaType.DIGICERT && configuration && "purpose" in configuration
      ? (configuration.purpose ?? DigiCertCaPurpose.Ssl)
      : DigiCertCaPurpose.Ssl;

  const isCsValidationCheckable =
    caType === CaType.DIGICERT &&
    digicertPurpose === DigiCertCaPurpose.CodeSigning &&
    !!digicertConnectionId &&
    !!digicertOrganizationId &&
    !!digicertProductNameId;

  const { data: csValidation, isFetching: isCsValidationFetching } =
    useDigiCertConnectionCodeSigningValidation(
      digicertConnectionId,
      digicertOrganizationId,
      digicertProductNameId,
      { enabled: isCsValidationCheckable }
    );

  const csOrgValidated = isCsValidationCheckable ? csValidation?.isValidated : undefined;
  const csRequiresContact = isCsValidationCheckable && csOrgValidated === false;
  const isCheckingCsValidation =
    isCsValidationCheckable && csOrgValidated === undefined && isCsValidationFetching;

  useEffect(() => {
    if (caType !== CaType.DIGICERT) return;
    setValue("configuration.csRequiresContact", csRequiresContact);
    if (!csRequiresContact) {
      setValue("configuration.verifiedContact", undefined);
    }
  }, [caType, csRequiresContact, setValue]);

  const onFormSubmit = async ({
    type,
    name,
    status,
    configuration: formConfiguration
  }: FormData) => {
    if (!currentProject?.slug) return;

    let configPayload: any;

    if (type === CaType.ACME && "dnsAppConnection" in formConfiguration) {
      configPayload = {
        dnsProviderConfig: formConfiguration.dnsProviderConfig,
        directoryUrl: formConfiguration.directoryUrl,
        accountEmail: formConfiguration.accountEmail,
        dnsAppConnectionId: formConfiguration.dnsAppConnection.id,
        eabKid: formConfiguration.eabKid,
        eabHmacKey: formConfiguration.eabHmacKey,
        dnsResolver: formConfiguration.dnsResolver || undefined
      };
    } else if (type === CaType.AZURE_AD_CS && "azureAdcsConnection" in formConfiguration) {
      configPayload = {
        azureAdcsConnectionId: formConfiguration.azureAdcsConnection.id
      };
    } else if (type === CaType.AWS_PCA && "awsConnection" in formConfiguration) {
      configPayload = {
        appConnectionId: formConfiguration.awsConnection.id,
        certificateAuthorityArn: formConfiguration.certificateAuthorityArn,
        region: formConfiguration.region
      };
    } else if (type === CaType.DIGICERT && "digicertConnection" in formConfiguration) {
      const purposeForPayload = formConfiguration.purpose ?? DigiCertCaPurpose.Ssl;
      configPayload = {
        appConnectionId: formConfiguration.digicertConnection.id,
        organizationId: formConfiguration.organizationId,
        productNameId: formConfiguration.productNameId,
        purpose: purposeForPayload,
        ...(purposeForPayload === DigiCertCaPurpose.CodeSigning &&
        formConfiguration.csRequiresContact &&
        formConfiguration.verifiedContact
          ? { verifiedContact: formConfiguration.verifiedContact }
          : {})
      };
    } else if (type === CaType.AWS_ACM_PUBLIC_CA && "awsConnection" in formConfiguration) {
      configPayload = {
        appConnectionId: formConfiguration.awsConnection.id,
        dnsAppConnectionId: formConfiguration.dnsConnection.id,
        hostedZoneId: formConfiguration.hostedZoneId,
        region: formConfiguration.region
      };
    } else if (type === CaType.VENAFI_TPP && "venafiTppConnection" in formConfiguration) {
      configPayload = {
        appConnectionId: formConfiguration.venafiTppConnection.id,
        policyDN: formConfiguration.policyDN
      };
    } else if (type === CaType.GODADDY && "godaddyConnection" in formConfiguration) {
      configPayload = {
        appConnectionId: formConfiguration.godaddyConnection.id,
        productType: formConfiguration.productType
      };
    } else {
      throw new Error("Invalid certificate authority configuration");
    }

    if (ca) {
      await updateMutateAsync({
        id: ca.id,
        name,
        type,
        status,
        configuration: configPayload
      });
    } else {
      await createMutateAsync({
        name,
        type,
        status,
        configuration: configPayload
      });
    }

    reset();
    handlePopUpToggle("ca", false);

    createNotification({
      text: `Successfully ${ca ? "updated" : "created"} CA`,
      type: "success"
    });
  };

  const modalContainer = useRef<HTMLDivElement>(null);

  return (
    <Modal
      isOpen={popUp?.ca?.isOpen}
      onOpenChange={(isOpen) => {
        reset();
        handlePopUpToggle("ca", isOpen);
      }}
    >
      <ModalContent ref={modalContainer} title={`${ca ? "Edit" : "Create"} External CA`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          {ca && (
            <FormControl label="CA ID">
              <Input value={ca.id} isDisabled className="bg-white/[0.07]" />
            </FormControl>
          )}
          <Controller
            control={control}
            name="type"
            defaultValue={CaType.ACME}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="CA Type" errorText={error?.message} isError={Boolean(error)}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                  isDisabled={Boolean(ca)}
                >
                  {caTypes.map(({ label, value }) => (
                    <SelectItem value={String(value || "")} key={label}>
                      {label}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="my-external-ca" isDisabled={Boolean(ca)} />
              </FormControl>
            )}
          />
          {caType === CaType.ACME && (
            <>
              <Controller
                control={control}
                name="configuration.dnsProviderConfig.provider"
                defaultValue={AcmeDnsProvider.ROUTE53}
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="DNS Provider"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <Select
                      defaultValue={field.value}
                      {...field}
                      onValueChange={(e) => onChange(e)}
                      className="w-full"
                      isDisabled={Boolean(ca)}
                    >
                      {Object.values(AcmeDnsProvider).map((provider) => (
                        <SelectItem value={String(provider)} key={provider}>
                          {ACME_DNS_PROVIDER_NAME_MAP[provider]}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
              <Controller
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    tooltipText={
                      dnsProvider
                        ? `${ACME_DNS_PROVIDER_NAME_MAP[dnsProvider]} uses the ${APP_CONNECTION_MAP[ACME_DNS_PROVIDER_APP_CONNECTION_MAP[dnsProvider]].name} App Connection. You can create one in the Organization Settings page.`
                        : "Select a DNS provider first"
                    }
                    isError={Boolean(error)}
                    errorText={error?.message}
                    label="DNS App Connection"
                  >
                    <FilterableSelect
                      value={value}
                      onChange={(newValue) => {
                        onChange(newValue);
                      }}
                      isLoading={isPending}
                      options={availableConnections}
                      placeholder="Select connection..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                      components={{ Option: AppConnectionOption }}
                    />
                  </FormControl>
                )}
                control={control}
                name="configuration.dnsAppConnection"
              />
              {dnsProvider === AcmeDnsProvider.ROUTE53 && (
                <Controller
                  control={control}
                  defaultValue=""
                  name="configuration.dnsProviderConfig.hostedZoneId"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Hosted Zone ID"
                      isError={Boolean(error)}
                      errorText={error?.message}
                      isRequired
                    >
                      <Input {...field} placeholder="Z040441124N1GOOMCQYX1" />
                    </FormControl>
                  )}
                />
              )}
              {dnsProvider === AcmeDnsProvider.Cloudflare && (
                <Controller
                  name="configuration.dnsProviderConfig.hostedZoneId"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      label="Zone"
                    >
                      <FilterableSelect
                        isLoading={isZonesPending && !!dnsAppConnection.id}
                        isDisabled={!dnsAppConnection.id}
                        value={cloudflareZones.find((zone) => zone.id === value)}
                        onChange={(option) => {
                          onChange((option as SingleValue<TCloudflareZone>)?.id ?? null);
                        }}
                        options={cloudflareZones}
                        placeholder="Select a zone..."
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                    </FormControl>
                  )}
                />
              )}
              {dnsProvider === AcmeDnsProvider.DNSMadeEasy && (
                <Controller
                  name="configuration.dnsProviderConfig.hostedZoneId"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      label="Zone"
                    >
                      <FilterableSelect
                        isLoading={isDNSMadeEasyZonesPending && !!dnsAppConnection.id}
                        isDisabled={!dnsAppConnection.id}
                        value={dnsMadeEasyZones.find((zone) => zone.id === value)}
                        onChange={(option) => {
                          onChange((option as SingleValue<TDNSMadeEasyZone>)?.id ?? null);
                        }}
                        options={dnsMadeEasyZones}
                        placeholder="Select a zone..."
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                    </FormControl>
                  )}
                />
              )}
              {dnsProvider === AcmeDnsProvider.AzureDNS && (
                <Controller
                  name="configuration.dnsProviderConfig.hostedZoneId"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      label="Zone"
                    >
                      <FilterableSelect
                        isLoading={isAzureDNSZonesPending && !!dnsAppConnection.id}
                        isDisabled={!dnsAppConnection.id}
                        value={azureDnsZones.find((zone) => zone.id === value)}
                        onChange={(option) => {
                          onChange((option as SingleValue<TAzureDNSZone>)?.id ?? null);
                        }}
                        options={azureDnsZones}
                        placeholder="Select a zone..."
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                    </FormControl>
                  )}
                />
              )}
              <Controller
                control={control}
                defaultValue=""
                name="configuration.directoryUrl"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Directory URL"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input
                      {...field}
                      placeholder="https://acme-v02.api.letsencrypt.org/directory"
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="configuration.accountEmail"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Account Email"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input {...field} placeholder="user@infisical.com" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="configuration.eabKid"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="EAB Key Identifier (KID)"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isOptional={!REQUIRED_EAB_DIRECTORIES.includes(directoryUrl || "")}
                    isRequired={REQUIRED_EAB_DIRECTORIES.includes(directoryUrl || "")}
                  >
                    <Input
                      {...field}
                      placeholder="abc123def456ghi789jkl012mno345pqr678stu901vwx234yz"
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="configuration.eabHmacKey"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="EAB HMAC Key"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isOptional
                  >
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                      placeholder={
                        ca
                          ? undefined
                          : "dGhpc2lzYW5leGFtcGxlaG1hY2tleWZvcmRpZ2ljZXJ0YWNtZXRlc3RpbmcxMjM0NTY3ODkw"
                      }
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="configuration.dnsResolver"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="DNS Resolver IP"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isOptional
                    tooltipText="A custom DNS resolver IP address used to verify DNS propagation during ACME challenges. Must be a valid IP (e.g. 8.8.8.8). Leave empty to use the system default."
                  >
                    <Input {...field} placeholder="8.8.8.8" />
                  </FormControl>
                )}
              />
            </>
          )}
          {caType === CaType.AZURE_AD_CS && (
            <Controller
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  tooltipText="Azure ADCS App Connection contains the Windows domain credentials and ADCS server URL for certificate requests."
                  isError={Boolean(error)}
                  errorText={error?.message}
                  label="Azure ADCS Connection"
                >
                  <FilterableSelect
                    menuPlacement="top"
                    value={value}
                    onChange={(newValue) => {
                      onChange(newValue);
                    }}
                    isLoading={isPending}
                    options={availableConnections}
                    placeholder="Select connection..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.id}
                    components={{ Option: AppConnectionOption }}
                  />
                </FormControl>
              )}
              control={control}
              name="configuration.azureAdcsConnection"
            />
          )}
          {caType === CaType.AWS_PCA && (
            <>
              <Controller
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    tooltipText="AWS App Connection provides the credentials used to communicate with AWS Private Certificate Authority."
                    isError={Boolean(error)}
                    errorText={error?.message}
                    label="AWS Connection"
                  >
                    <FilterableSelect
                      value={value}
                      onChange={(newValue) => {
                        onChange(newValue);
                      }}
                      isLoading={isPending}
                      options={availableConnections}
                      placeholder="Select connection..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                      components={{ Option: AppConnectionOption }}
                    />
                  </FormControl>
                )}
                control={control}
                name="configuration.awsConnection"
              />
              <Controller
                control={control}
                defaultValue=""
                name="configuration.certificateAuthorityArn"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Certificate Authority ARN"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input
                      {...field}
                      placeholder="arn:aws:acm-pca:us-east-1:123456789012:certificate-authority/abc-123"
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="configuration.region"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Region"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <AwsRegionSelect value={value} onChange={(v) => onChange(v || "")} />
                  </FormControl>
                )}
              />
            </>
          )}
          {caType === CaType.DIGICERT && (
            <>
              <Controller
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    tooltipText="DigiCert App Connection provides the CertCentral API key used to place orders."
                    isError={Boolean(error)}
                    errorText={error?.message}
                    label="DigiCert Connection"
                    isRequired
                  >
                    <FilterableSelect
                      value={value}
                      onChange={(newValue) => {
                        onChange(newValue);
                      }}
                      isLoading={isPending}
                      options={availableConnections}
                      placeholder="Select connection..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                      components={{ Option: AppConnectionOption }}
                    />
                  </FormControl>
                )}
                control={control}
                name="configuration.digicertConnection"
              />
              <Controller
                control={control}
                name="configuration.organizationId"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Organization"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                    tooltipText="The validated CertCentral organization that will appear on issued certificates."
                  >
                    <FilterableSelect
                      isLoading={isDigiCertOrgsPending && !!digicertConnectionId}
                      isDisabled={!digicertConnectionId}
                      value={digicertOrganizations.find((org) => org.id === value) ?? null}
                      onChange={(option) => {
                        onChange((option as SingleValue<TDigiCertOrganization>)?.id ?? 0);
                      }}
                      options={digicertOrganizations}
                      placeholder="Select an organization..."
                      getOptionLabel={(option) => option.displayName || option.name}
                      getOptionValue={(option) => String(option.id)}
                      menuPortalTarget={modalContainer.current}
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="configuration.purpose"
                render={({ field: { value, onChange }, fieldState: { error } }) => {
                  const PURPOSE_OPTIONS = [
                    { value: DigiCertCaPurpose.Ssl, label: "SSL / TLS" },
                    { value: DigiCertCaPurpose.CodeSigning, label: "Code Signing" }
                  ];
                  return (
                    <FormControl
                      label="Purpose"
                      errorText={error?.message}
                      isError={Boolean(error)}
                      isRequired
                      tooltipText="What this CA issues. Selecting Code Signing filters the Product list to DigiCert's code-signing products."
                    >
                      <FilterableSelect
                        value={
                          PURPOSE_OPTIONS.find(
                            (o) => o.value === (value ?? DigiCertCaPurpose.Ssl)
                          ) ?? PURPOSE_OPTIONS[0]
                        }
                        onChange={(option) => {
                          const next = (
                            option as SingleValue<{ value: DigiCertCaPurpose; label: string }>
                          )?.value;
                          if (next) {
                            onChange(next);
                            setValue("configuration.productNameId", "");
                          }
                        }}
                        options={PURPOSE_OPTIONS}
                        getOptionLabel={(option) => option.label}
                        getOptionValue={(option) => option.value}
                        menuPortalTarget={modalContainer.current}
                      />
                    </FormControl>
                  );
                }}
              />
              <Controller
                control={control}
                name="configuration.productNameId"
                render={({ field: { value, onChange }, fieldState: { error } }) => {
                  const purpose =
                    configuration && "purpose" in configuration
                      ? (configuration.purpose ?? DigiCertCaPurpose.Ssl)
                      : DigiCertCaPurpose.Ssl;
                  const filteredProducts = digicertProducts.filter((p) => {
                    if (purpose === DigiCertCaPurpose.CodeSigning)
                      return p.type === "code_signing_certificate";
                    return p.type === "ssl_certificate" || !p.type;
                  });
                  return (
                    <FormControl
                      label="Product"
                      errorText={error?.message}
                      isError={Boolean(error)}
                      isRequired
                      tooltipText="Products available are account-specific entitlements fetched from CertCentral. Each Infisical CA issues under exactly one product."
                    >
                      <FilterableSelect
                        isLoading={isDigiCertProductsPending && !!digicertConnectionId}
                        isDisabled={!digicertConnectionId}
                        value={filteredProducts.find((product) => product.nameId === value) ?? null}
                        onChange={(option) => {
                          onChange((option as SingleValue<TDigiCertProduct>)?.nameId ?? "");
                        }}
                        options={filteredProducts}
                        placeholder="Select a product..."
                        getOptionLabel={(option) => `${option.name} (${option.nameId})`}
                        getOptionValue={(option) => option.nameId}
                        menuPortalTarget={modalContainer.current}
                      />
                    </FormControl>
                  );
                }}
              />
              {/* Shown only when the org is not yet code-signing validated. While the check is in
                  flight nothing renders here — the submit button shows a loading state instead. */}
              {csRequiresContact && (
                <div className="mt-3 mb-2 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
                  <div className="mb-1 text-sm font-medium text-mineshaft-100">
                    Verified Contact
                  </div>
                  <div className="mb-4 text-xs text-mineshaft-400">
                    This organization has not completed DigiCert code-signing validation yet, so a
                    verified contact is required. DigiCert emails this person an approval link they
                    must click to start organization validation.
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <Controller
                      control={control}
                      name="configuration.verifiedContact.firstName"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="First Name"
                          errorText={error?.message}
                          isError={Boolean(error)}
                          isRequired
                        >
                          <Input {...field} value={field.value ?? ""} placeholder="John" />
                        </FormControl>
                      )}
                    />
                    <Controller
                      control={control}
                      name="configuration.verifiedContact.lastName"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Last Name"
                          errorText={error?.message}
                          isError={Boolean(error)}
                          isRequired
                        >
                          <Input {...field} value={field.value ?? ""} placeholder="Doe" />
                        </FormControl>
                      )}
                    />
                    <Controller
                      control={control}
                      name="configuration.verifiedContact.email"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Email"
                          errorText={error?.message}
                          isError={Boolean(error)}
                          isRequired
                          className="col-span-2"
                        >
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="john.doe@example.com"
                          />
                        </FormControl>
                      )}
                    />
                    <Controller
                      control={control}
                      name="configuration.verifiedContact.jobTitle"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Job Title"
                          errorText={error?.message}
                          isError={Boolean(error)}
                          isRequired
                        >
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Security Engineer"
                          />
                        </FormControl>
                      )}
                    />
                    <Controller
                      control={control}
                      name="configuration.verifiedContact.telephone"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Telephone"
                          errorText={error?.message}
                          isError={Boolean(error)}
                          isRequired
                          tooltipText="Include the country code, e.g. +15551234567."
                        >
                          <Input {...field} value={field.value ?? ""} placeholder="+15551234567" />
                        </FormControl>
                      )}
                    />
                  </div>
                </div>
              )}
            </>
          )}
          {caType === CaType.AWS_ACM_PUBLIC_CA && (
            <>
              <Controller
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    tooltipText="AWS App Connection used to issue, export, renew, and revoke certificates via AWS Certificate Manager (ACM)."
                    isError={Boolean(error)}
                    errorText={error?.message}
                    label="AWS Connection"
                    isRequired
                  >
                    <FilterableSelect
                      value={value}
                      onChange={(newValue) => {
                        onChange(newValue);
                      }}
                      isLoading={isPending}
                      options={availableConnections}
                      placeholder="Select connection..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                      components={{ Option: AppConnectionOption }}
                    />
                  </FormControl>
                )}
                control={control}
                name="configuration.awsConnection"
              />
              <Controller
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    tooltipText="AWS App Connection used to write the ACM CNAME validation records into Route 53."
                    isError={Boolean(error)}
                    errorText={error?.message}
                    label="Route 53 Connection"
                    isRequired
                  >
                    <FilterableSelect
                      value={value}
                      onChange={(newValue) => {
                        onChange(newValue);
                      }}
                      isLoading={isPending}
                      options={availableConnections}
                      placeholder="Select connection..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                      components={{ Option: AppConnectionOption }}
                    />
                  </FormControl>
                )}
                control={control}
                name="configuration.dnsConnection"
              />
              <Controller
                control={control}
                defaultValue=""
                name="configuration.hostedZoneId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Route 53 Hosted Zone ID"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                    tooltipText="The Route 53 hosted zone that owns the domain(s) you'll issue certificates for."
                  >
                    <Input {...field} placeholder="Z040441124N1GOOMCQYX1" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="configuration.region"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Region"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <AwsRegionSelect value={value} onChange={(v) => onChange(v || "")} />
                  </FormControl>
                )}
              />
            </>
          )}
          {caType === CaType.VENAFI_TPP && (
            <>
              <Controller
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    tooltipText="Venafi TPP App Connection contains the credentials to connect to your Venafi Trust Protection Platform instance."
                    isError={Boolean(error)}
                    errorText={error?.message}
                    label="Venafi TPP Connection"
                  >
                    <FilterableSelect
                      value={value}
                      onChange={(newValue) => {
                        onChange(newValue);
                      }}
                      isLoading={isPending}
                      options={availableConnections}
                      placeholder="Select connection..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                      components={{ Option: AppConnectionOption }}
                    />
                  </FormControl>
                )}
                control={control}
                name="configuration.venafiTppConnection"
              />
              <Controller
                control={control}
                defaultValue=""
                name="configuration.policyDN"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Policy DN"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                    tooltipText="The policy folder path in Venafi TPP where certificates will be managed (e.g., \VED\Policy\Certificates)."
                  >
                    <Input {...field} placeholder="\VED\Policy\Certificates" />
                  </FormControl>
                )}
              />
            </>
          )}
          {caType === CaType.GODADDY && (
            <>
              <Controller
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    tooltipText="GoDaddy App Connection provides the API key and secret used to place certificate orders."
                    isError={Boolean(error)}
                    errorText={error?.message}
                    label="GoDaddy Connection"
                  >
                    <FilterableSelect
                      value={value}
                      onChange={(newValue) => {
                        onChange(newValue);
                      }}
                      isLoading={isPending}
                      options={availableConnections}
                      placeholder="Select connection..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                      components={{ Option: AppConnectionOption }}
                    />
                  </FormControl>
                )}
                control={control}
                name="configuration.godaddyConnection"
              />
              <Controller
                control={control}
                name="configuration.productType"
                defaultValue={GoDaddyProductType.DV_SSL}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Product"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                    tooltipText="Domain Validated SSL product to use for issuance."
                  >
                    <Select
                      value={value}
                      onValueChange={(val) => onChange(val)}
                      className="w-full border border-mineshaft-500"
                      position="popper"
                      dropdownContainerClassName="max-w-none"
                    >
                      <SelectItem value={GoDaddyProductType.DV_SSL}>DV SSL</SelectItem>
                    </Select>
                  </FormControl>
                )}
              />
            </>
          )}
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting || isCheckingCsValidation}
              isDisabled={isSubmitting || isCheckingCsValidation}
            >
              {popUp?.ca?.data ? "Update" : "Create"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("ca", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
