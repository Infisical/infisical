import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  TAvailableAppConnection,
  useListAvailableAppConnections
} from "@app/hooks/api/appConnections";
import {
  TCloudflareZone,
  useCloudflareConnectionListZones
} from "@app/hooks/api/appConnections/cloudflare";
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

const baseSchema = z.object({
  type: z.nativeEnum(CaType),
  name: slugSchema({
    field: "Name"
  }),
  enableDirectIssuance: z.boolean(),
  status: z.nativeEnum(CaStatus)
});

const acmeConfigurationSchema = z.object({
  dnsAppConnection: z.object({
    id: z.string(),
    name: z.string()
  }),
  dnsProviderConfig: z.object({
    provider: z.nativeEnum(AcmeDnsProvider),
    hostedZoneId: z.string()
  }),
  directoryUrl: z.string(),
  accountEmail: z.string()
});

const azureAdCsConfigurationSchema = z.object({
  azureAdcsConnection: z.object({
    id: z.string(),
    name: z.string()
  })
});

const schema = z.discriminatedUnion("type", [
  baseSchema.extend({
    type: z.literal(CaType.ACME),
    configuration: acmeConfigurationSchema
  }),
  baseSchema.extend({
    type: z.literal(CaType.AZURE_AD_CS),
    configuration: azureAdCsConfigurationSchema
  })
]);

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["ca"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["ca"]>, state?: boolean) => void;
};

const caTypes = [
  { label: "ACME", value: CaType.ACME },
  { label: "Azure AD Certificate Service", value: CaType.AZURE_AD_CS }
];

export const ExternalCaModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();

  const { data: ca, isLoading: isCaLoading } = useGetCa({
    caName: (popUp?.ca?.data as { name: string })?.name || "",
    projectId: currentWorkspace?.id || "",
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

  useEffect(() => {
    const initialType = (popUp?.ca?.data as { type: CaType })?.type;
    if (!ca && popUp?.ca?.isOpen) {
      if (initialType === CaType.AZURE_AD_CS) {
        reset({
          type: CaType.AZURE_AD_CS,
          name: "",
          status: CaStatus.ACTIVE,
          enableDirectIssuance: false,
          configuration: {
            azureAdcsConnection: {
              id: "",
              name: ""
            }
          }
        });
      } else {
        reset({
          type: CaType.ACME,
          name: "",
          status: CaStatus.ACTIVE,
          enableDirectIssuance: true,
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
            accountEmail: ""
          }
        });
      }
    }
  }, [popUp?.ca?.isOpen, popUp?.ca?.data, reset, ca]);

  const { data: availableRoute53Connections, isPending: isRoute53Pending } =
    useListAvailableAppConnections(AppConnection.AWS, {
      enabled: caType === CaType.ACME
    });

  const { data: availableCloudflareConnections, isPending: isCloudflarePending } =
    useListAvailableAppConnections(AppConnection.Cloudflare, {
      enabled: caType === CaType.ACME
    });

  const { data: availableAzureConnections, isPending: isAzurePending } =
    useListAvailableAppConnections(AppConnection.AzureADCS, {
      enabled: caType === CaType.AZURE_AD_CS
    });

  const availableConnections: TAvailableAppConnection[] = useMemo(() => {
    if (caType === CaType.ACME) {
      return [...(availableRoute53Connections || []), ...(availableCloudflareConnections || [])];
    }
    if (caType === CaType.AZURE_AD_CS) {
      return availableAzureConnections || [];
    }
    return [];
  }, [
    caType,
    availableRoute53Connections,
    availableCloudflareConnections,
    availableAzureConnections
  ]);

  const isPending = isRoute53Pending || isCloudflarePending || isAzurePending;

  const dnsAppConnection =
    caType === CaType.ACME && configuration && "dnsAppConnection" in configuration
      ? configuration.dnsAppConnection
      : { id: "", name: "" };

  const { data: cloudflareZones = [], isPending: isZonesPending } =
    useCloudflareConnectionListZones(dnsAppConnection.id, {
      enabled: dnsProvider === AcmeDnsProvider.Cloudflare && !!dnsAppConnection.id
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
          enableDirectIssuance: ca.enableDirectIssuance,
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
            accountEmail: ca.configuration.accountEmail
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
          enableDirectIssuance: false,
          configuration: {
            azureAdcsConnection: {
              id: ca.configuration.azureAdcsConnectionId,
              name: selectedConnection?.name || ""
            }
          }
        });
      }
    }
  }, [ca, availableConnections, reset, isCaLoading]);

  const onFormSubmit = async ({
    type,
    name,
    enableDirectIssuance,
    status,
    configuration: formConfiguration
  }: FormData) => {
    try {
      if (!currentWorkspace?.slug) return;

      let configPayload: any;

      if (type === CaType.ACME && "dnsAppConnection" in formConfiguration) {
        configPayload = {
          dnsProviderConfig: formConfiguration.dnsProviderConfig,
          directoryUrl: formConfiguration.directoryUrl,
          accountEmail: formConfiguration.accountEmail,
          dnsAppConnectionId: formConfiguration.dnsAppConnection.id
        };
      } else if (type === CaType.AZURE_AD_CS && "azureAdcsConnection" in formConfiguration) {
        configPayload = {
          azureAdcsConnectionId: formConfiguration.azureAdcsConnection.id
        };
      } else {
        throw new Error("Invalid certificate authority configuration");
      }

      if (ca) {
        await updateMutateAsync({
          caName: ca.name,
          projectId: currentWorkspace.id,
          name,
          type,
          status,
          enableDirectIssuance: type === CaType.AZURE_AD_CS ? false : enableDirectIssuance,
          configuration: configPayload
        });
      } else {
        await createMutateAsync({
          projectId: currentWorkspace.id,
          name,
          type,
          status,
          enableDirectIssuance: type === CaType.AZURE_AD_CS ? false : enableDirectIssuance,
          configuration: configPayload
        });
      }

      reset();
      handlePopUpToggle("ca", false);

      createNotification({
        text: `Successfully ${ca ? "updated" : "created"} CA`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create CA",
        type: "error"
      });
    }
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
              <FormControl label="Type" errorText={error?.message} isError={Boolean(error)}>
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
                  />
                </FormControl>
              )}
              control={control}
              name="configuration.azureAdcsConnection"
            />
          )}
          {caType === CaType.ACME && (
            <Controller
              control={control}
              name="enableDirectIssuance"
              render={({ field, fieldState: { error } }) => {
                return (
                  <FormControl isError={Boolean(error)} errorText={error?.message} className="my-8">
                    <Switch
                      id="is-active"
                      onCheckedChange={(value) => field.onChange(value)}
                      isChecked={field.value}
                    >
                      <p className="w-full">Enable Direct Issuance</p>
                    </Switch>
                  </FormControl>
                );
              }}
            />
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
