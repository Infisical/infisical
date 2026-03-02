import { useEffect, useMemo } from "react";
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
  TDNSMadeEasyZone,
  useDNSMadeEasyConnectionListZones
} from "@app/hooks/api/appConnections/dns-made-easy";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  AcmeDnsProvider,
  CaStatus,
  CaType,
  useCreateCa,
  useGetCa,
  useUpdateCa
} from "@app/hooks/api/ca";
import {
  ACME_DNS_PROVIDER_APP_CONNECTION_MAP,
  ACME_DNS_PROVIDER_NAME_MAP
} from "@app/hooks/api/ca/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

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
    eabHmacKey: z.string().optional()
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
      if (!data.eabHmacKey || data.eabHmacKey.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "EAB HMAC Key is required for this directory URL",
          path: ["eabHmacKey"]
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
  { label: "AWS Private CA (PCA)", value: CaType.AWS_PCA }
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
    watch
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
            eabHmacKey: ""
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
      enabled: caType === CaType.AWS_PCA
    }
  );

  const availableConnections: TAvailableAppConnection[] = useMemo(() => {
    if (caType === CaType.AZURE_AD_CS) {
      return availableAzureConnections || [];
    }
    if (caType === CaType.AWS_PCA) {
      return availableAwsConnections || [];
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
    availableAwsConnections
  ]);

  const isPending =
    isRoute53Pending ||
    isCloudflarePending ||
    isDNSMadeEasyPending ||
    isAzureDNSPending ||
    (isAzurePending && caType === CaType.AZURE_AD_CS) ||
    (isAwsPending && caType === CaType.AWS_PCA);

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
            eabHmacKey: ca.configuration.eabHmacKey
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
      }
    }
  }, [ca, availableConnections, reset, isCaLoading]);

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
        eabHmacKey: formConfiguration.eabHmacKey
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
    } else {
      throw new Error("Invalid certificate authority configuration");
    }

    if (ca) {
      await updateMutateAsync({
        id: ca.id,
        projectId: currentProject.id,
        name,
        type,
        status,
        configuration: configPayload
      });
    } else {
      await createMutateAsync({
        projectId: currentProject.id,
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

  return (
    <Modal
      isOpen={popUp?.ca?.isOpen}
      onOpenChange={(isOpen) => {
        reset();
        handlePopUpToggle("ca", isOpen);
      }}
    >
      <ModalContent title={`${ca ? "Edit" : "Create"} External CA`}>
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
                    isOptional={!REQUIRED_EAB_DIRECTORIES.includes(directoryUrl || "")}
                    isRequired={REQUIRED_EAB_DIRECTORIES.includes(directoryUrl || "")}
                  >
                    <Input
                      {...field}
                      placeholder="dGhpc2lzYW5leGFtcGxlaG1hY2tleWZvcmRpZ2ljZXJ0YWNtZXRlc3RpbmcxMjM0NTY3ODkw"
                    />
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
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
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
