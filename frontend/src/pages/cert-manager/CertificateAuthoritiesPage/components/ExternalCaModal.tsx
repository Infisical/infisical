import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, Loader2Icon, Lock, type LucideIcon, Search } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  TAvailableAppConnection,
  useListAvailableAppConnections
} from "@app/hooks/api/appConnections";
import { useAzureDNSConnectionListZones } from "@app/hooks/api/appConnections/azure-dns";
import { useCloudflareConnectionListZones } from "@app/hooks/api/appConnections/cloudflare";
import {
  useDigiCertConnectionListOrganizations,
  useDigiCertConnectionListProducts,
  useDigiCertConnectionOrgValidation
} from "@app/hooks/api/appConnections/digicert";
import { useDNSMadeEasyConnectionListZones } from "@app/hooks/api/appConnections/dns-made-easy";
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
  DigiCertCaPurpose,
  TCreateCertificateAuthorityDTO,
  TUpdateCertificateAuthorityDTO
} from "@app/hooks/api/ca/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AcmeFields } from "./ExternalCaFields/AcmeFields";
import { AdcsFields } from "./ExternalCaFields/AdcsFields";
import { AwsAcmPublicCaFields } from "./ExternalCaFields/AwsAcmPublicCaFields";
import { AwsPcaFields } from "./ExternalCaFields/AwsPcaFields";
import { AzureAdCsFields } from "./ExternalCaFields/AzureAdCsFields";
import { DigiCertFields } from "./ExternalCaFields/DigiCertFields";
import { ExternalCaHeader } from "./ExternalCaFields/ExternalCaHeader";
import { GoDaddyFields } from "./ExternalCaFields/GoDaddyFields";
import { FormData, schema } from "./ExternalCaFields/schema";
import { VenafiTppFields } from "./ExternalCaFields/VenafiTppFields";

const UNCHANGED_CREDENTIAL_SENTINEL = "__INFISICAL_UNCHANGED__";

type ExternalCaConfigurationPayload =
  | {
      dnsProviderConfig: { provider: AcmeDnsProvider; hostedZoneId: string };
      directoryUrl: string;
      accountEmail: string;
      dnsAppConnectionId: string;
      eabKid?: string;
      eabHmacKey?: string;
      dnsResolver?: string;
    }
  | { azureAdcsConnectionId: string }
  | { appConnectionId: string; caName?: string }
  | { appConnectionId: string; certificateAuthorityArn: string; region: string }
  | {
      appConnectionId: string;
      organizationId: number;
      productNameId: string;
      purpose: DigiCertCaPurpose;
      verifiedContact?: {
        firstName?: string;
        lastName?: string;
        email?: string;
        jobTitle?: string;
        telephone?: string;
      };
    }
  | { appConnectionId: string; dnsAppConnectionId: string; hostedZoneId: string; region: string }
  | { appConnectionId: string; policyDN: string }
  | { appConnectionId: string; productType: GoDaddyProductType };

type Props = {
  popUp: UsePopUpState<["ca"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["ca"]>, state?: boolean) => void;
};

type ExternalCaOption = {
  type: CaType;
  name: string;
  category: string;
  description: string;
  image?: string;
  icon?: LucideIcon;
};

const EXTERNAL_CA_OPTIONS: ExternalCaOption[] = [
  {
    type: CaType.ACME,
    name: "ACME",
    category: "Protocol",
    description: "Issue certificates from any ACME directory such as Let's Encrypt or ZeroSSL.",
    icon: Lock
  },
  {
    type: CaType.ADCS,
    name: "Microsoft ADCS",
    category: "Certificates",
    description: "Issue certificates via Active Directory Certificate Services over the Gateway.",
    image: "Windows.png"
  },
  {
    type: CaType.AWS_PCA,
    name: "AWS Private CA",
    category: "AWS",
    description: "Issue certificates from AWS Private Certificate Authority.",
    image: "Amazon Web Services.png"
  },
  {
    type: CaType.AWS_ACM_PUBLIC_CA,
    name: "AWS ACM Public CA",
    category: "AWS",
    description: "Issue publicly-trusted certificates via AWS Certificate Manager.",
    image: "Amazon Web Services.png"
  },
  {
    type: CaType.DIGICERT,
    name: "DigiCert CertCentral",
    category: "Certificates",
    description: "Issue certificates from DigiCert CertCentral.",
    image: "DigiCert.png"
  },
  {
    type: CaType.VENAFI_TPP,
    name: "Venafi TPP",
    category: "Certificates",
    description: "Issue certificates from Venafi Trust Protection Platform.",
    image: "Venafi.png"
  },
  {
    type: CaType.GODADDY,
    name: "GoDaddy",
    category: "Certificates",
    description: "Issue certificates from GoDaddy.",
    image: "GoDaddy.png"
  }
];

const CA_TYPE_NAME: Partial<Record<CaType, string>> = {
  ...Object.fromEntries(EXTERNAL_CA_OPTIONS.map((option) => [option.type, option.name])),
  [CaType.AZURE_AD_CS]: "Azure ADCS (Web Enrollment)"
};

const CA_TYPE_MEDIA: Partial<Record<CaType, Pick<ExternalCaOption, "image" | "icon">>> = {
  ...Object.fromEntries(
    EXTERNAL_CA_OPTIONS.map((option) => [option.type, { image: option.image, icon: option.icon }])
  ),
  [CaType.AZURE_AD_CS]: { image: "Microsoft Azure.png" }
};

const CaTypeCard = ({ option, onClick }: { option: ExternalCaOption; onClick: () => void }) => {
  const Icon = option.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-mineshaft-500 hover:bg-mineshaft-700/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-mineshaft-700">
          {option.image ? (
            <img
              src={`/images/integrations/${option.image}`}
              alt={`${option.name} logo`}
              className="h-6 w-6 object-contain"
            />
          ) : (
            Icon && <Icon className="h-5 w-5 text-foreground" />
          )}
        </div>
        <span className="text-[10px] font-medium tracking-wider text-muted uppercase">
          {option.category}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{option.name}</p>
        <p className="text-xs leading-relaxed text-muted">{option.description}</p>
      </div>
    </button>
  );
};

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

  const editCaId = (popUp?.ca?.data as { caId?: string })?.caId;
  const isEditMode = Boolean(editCaId);

  const [selectedType, setSelectedType] = useState<CaType | null>(null);
  const [search, setSearch] = useState("");

  const getInitialValuesForType = (type: CaType): FormData => {
    switch (type) {
      case CaType.AZURE_AD_CS:
        return {
          type: CaType.AZURE_AD_CS,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: { azureAdcsConnection: { id: "", name: "" } }
        };
      case CaType.ADCS:
        return {
          type: CaType.ADCS,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: { adcsConnection: { id: "", name: "" }, caName: "" }
        };
      case CaType.AWS_PCA:
        return {
          type: CaType.AWS_PCA,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            awsConnection: { id: "", name: "" },
            certificateAuthorityArn: "",
            region: ""
          }
        };
      case CaType.DIGICERT:
        return {
          type: CaType.DIGICERT,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            digicertConnection: { id: "", name: "" },
            organizationId: 0,
            productNameId: "",
            purpose: DigiCertCaPurpose.Ssl,
            verifiedContact: undefined
          }
        };
      case CaType.AWS_ACM_PUBLIC_CA:
        return {
          type: CaType.AWS_ACM_PUBLIC_CA,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            awsConnection: { id: "", name: "" },
            dnsConnection: { id: "", name: "" },
            hostedZoneId: "",
            region: ""
          }
        };
      case CaType.VENAFI_TPP:
        return {
          type: CaType.VENAFI_TPP,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: { venafiTppConnection: { id: "", name: "" }, policyDN: "" }
        };
      case CaType.GODADDY:
        return {
          type: CaType.GODADDY,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            godaddyConnection: { id: "", name: "" },
            productType: GoDaddyProductType.DV_SSL
          }
        };
      case CaType.ACME:
      default:
        return {
          type: CaType.ACME,
          name: "",
          status: CaStatus.ACTIVE,
          configuration: {
            dnsAppConnection: { id: "", name: "" },
            dnsProviderConfig: { provider: AcmeDnsProvider.ROUTE53, hostedZoneId: "" },
            directoryUrl: "",
            accountEmail: "",
            eabKid: "",
            eabHmacKey: "",
            dnsResolver: ""
          }
        };
    }
  };

  const handleSelectType = (type: CaType) => {
    reset(getInitialValuesForType(type));
    setSelectedType(type);
  };

  useEffect(() => {
    if (popUp?.ca?.isOpen && !isEditMode) {
      setSelectedType(null);
      setSearch("");
      reset(undefined);
    }
  }, [popUp?.ca?.isOpen, isEditMode, reset]);

  useEffect(() => {
    const editType = (popUp?.ca?.data as { type?: CaType })?.type;
    if (popUp?.ca?.isOpen && isEditMode && editType) {
      reset(getInitialValuesForType(editType));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popUp?.ca?.isOpen, isEditMode]);

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

  const { data: availableAdcsConnections, isPending: isAdcsPending } =
    useListAvailableAppConnections(AppConnection.ADCS, currentProject.id, {
      enabled: caType === CaType.ADCS
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
    if (caType === CaType.ADCS) {
      return availableAdcsConnections || [];
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
    availableAdcsConnections,
    availableAwsConnections,
    availableDigiCertConnections,
    availableVenafiTppConnections,
    availableGoDaddyConnections
  ]);

  const isPending =
    ((isRoute53Pending || isCloudflarePending || isDNSMadeEasyPending || isAzureDNSPending) &&
      caType === CaType.ACME) ||
    (isAzurePending && caType === CaType.AZURE_AD_CS) ||
    (isAdcsPending && caType === CaType.ADCS) ||
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
      } else if (ca.type === CaType.ADCS && availableConnections?.length) {
        const selectedConnection = availableConnections?.find(
          (connection) => connection.id === ca.configuration.appConnectionId
        );

        reset({
          type: ca.type,
          name: ca.name,
          status: ca.status,
          configuration: {
            adcsConnection: {
              id: ca.configuration.appConnectionId,
              name: selectedConnection?.name || ""
            },
            caName: ca.configuration.caName
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
    useDigiCertConnectionOrgValidation(
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

    let configPayload: ExternalCaConfigurationPayload;

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
    } else if (type === CaType.ADCS && "adcsConnection" in formConfiguration) {
      configPayload = {
        appConnectionId: formConfiguration.adcsConnection.id,
        ...(formConfiguration.caName?.trim() ? { caName: formConfiguration.caName.trim() } : {})
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
      } as TUpdateCertificateAuthorityDTO);
    } else {
      await createMutateAsync({
        name,
        type,
        status,
        configuration: configPayload
      } as TCreateCertificateAuthorityDTO);
    }

    reset();
    handlePopUpToggle("ca", false);

    createNotification({
      text: `Successfully ${ca ? "updated" : "created"} CA`,
      type: "success"
    });
  };

  const showGrid = !isEditMode && !selectedType;
  const activeType = isEditMode ? ca?.type : selectedType;
  const activeTypeName = activeType ? CA_TYPE_NAME[activeType] : undefined;
  const activeTypeMedia = activeType ? CA_TYPE_MEDIA[activeType] : undefined;
  const headerTitle = `${isEditMode ? "Edit" : "Create"} ${
    activeTypeName ? `${activeTypeName} CA` : "External CA"
  }`;

  const filteredCaOptions = EXTERNAL_CA_OPTIONS.filter((option) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      option.name.toLowerCase().includes(query) ||
      option.category.toLowerCase().includes(query) ||
      option.description.toLowerCase().includes(query)
    );
  });

  return (
    <Sheet
      open={popUp?.ca?.isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          reset();
          setSelectedType(null);
          setSearch("");
        }
        handlePopUpToggle("ca", isOpen);
      }}
    >
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border">
          {showGrid ? (
            <>
              <SheetTitle>Create External CA</SheetTitle>
              <SheetDescription>Select the certificate authority to connect to.</SheetDescription>
            </>
          ) : (
            <>
              {!isEditMode && (
                <button
                  type="button"
                  onClick={() => setSelectedType(null)}
                  className="mb-1 flex w-fit cursor-pointer items-center gap-1 text-xs text-muted transition-colors hover:text-foreground hover:underline"
                >
                  <ArrowLeftIcon className="size-3" />
                  Select Another CA
                </button>
              )}
              <SheetTitle>
                <ExternalCaHeader
                  name={headerTitle}
                  subtitle="Define the connection and credentials used to issue certificates from this CA."
                  image={activeTypeMedia?.image}
                  icon={activeTypeMedia?.icon}
                />
              </SheetTitle>
            </>
          )}
        </SheetHeader>

        {/* eslint-disable-next-line no-nested-ternary */}
        {showGrid ? (
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search certificate authorities..."
              />
            </InputGroup>
            <div className="grid grid-cols-2 gap-3">
              {filteredCaOptions.map((option) => (
                <CaTypeCard
                  key={option.type}
                  option={option}
                  onClick={() => handleSelectType(option.type)}
                />
              ))}
            </div>
          </div>
        ) : isEditMode && isCaLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Loader2Icon className="size-8 animate-spin text-accent" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onFormSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {ca && (
                <Field className="mb-4">
                  <FieldLabel>CA ID</FieldLabel>
                  <Input value={ca.id} disabled />
                </Field>
              )}
              <Controller
                control={control}
                defaultValue=""
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel>
                      Name <span className="text-danger">*</span>
                    </FieldLabel>
                    <Input
                      {...field}
                      placeholder="my-external-ca"
                      disabled={Boolean(ca)}
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              {caType === CaType.ACME && (
                <AcmeFields
                  control={control}
                  isExistingCa={Boolean(ca)}
                  dnsProvider={dnsProvider}
                  directoryUrl={directoryUrl}
                  dnsAppConnection={dnsAppConnection}
                  availableConnections={availableConnections}
                  isPending={isPending}
                  cloudflareZones={cloudflareZones}
                  isZonesPending={isZonesPending}
                  dnsMadeEasyZones={dnsMadeEasyZones}
                  isDNSMadeEasyZonesPending={isDNSMadeEasyZonesPending}
                  azureDnsZones={azureDnsZones}
                  isAzureDNSZonesPending={isAzureDNSZonesPending}
                />
              )}
              {caType === CaType.AZURE_AD_CS && (
                <AzureAdCsFields
                  control={control}
                  availableConnections={availableConnections}
                  isPending={isPending}
                />
              )}
              {caType === CaType.ADCS && (
                <AdcsFields
                  control={control}
                  availableConnections={availableConnections}
                  isPending={isPending}
                />
              )}
              {caType === CaType.AWS_PCA && (
                <AwsPcaFields
                  control={control}
                  availableConnections={availableConnections}
                  isPending={isPending}
                />
              )}
              {caType === CaType.DIGICERT && (
                <DigiCertFields
                  control={control}
                  setValue={setValue}
                  configuration={configuration}
                  availableConnections={availableConnections}
                  isPending={isPending}
                  digicertConnectionId={digicertConnectionId}
                  digicertOrganizations={digicertOrganizations}
                  isDigiCertOrgsPending={isDigiCertOrgsPending}
                  digicertProducts={digicertProducts}
                  isDigiCertProductsPending={isDigiCertProductsPending}
                  csRequiresContact={csRequiresContact}
                />
              )}
              {caType === CaType.AWS_ACM_PUBLIC_CA && (
                <AwsAcmPublicCaFields
                  control={control}
                  availableConnections={availableConnections}
                  isPending={isPending}
                />
              )}
              {caType === CaType.VENAFI_TPP && (
                <VenafiTppFields
                  control={control}
                  availableConnections={availableConnections}
                  isPending={isPending}
                />
              )}
              {caType === CaType.GODADDY && (
                <GoDaddyFields
                  control={control}
                  availableConnections={availableConnections}
                  isPending={isPending}
                />
              )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handlePopUpToggle("ca", false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="project"
                isPending={isSubmitting || isCheckingCsValidation}
                isDisabled={isSubmitting || isCheckingCsValidation}
              >
                {isEditMode ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
};
