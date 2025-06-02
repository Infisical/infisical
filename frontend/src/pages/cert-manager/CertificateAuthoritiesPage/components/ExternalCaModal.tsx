import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  AcmeDnsProvider,
  CaStatus,
  CaType,
  useCreateCa,
  useGetCa,
  useUpdateCa
} from "@app/hooks/api/ca";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

const schema = z
  .object({
    type: z.nativeEnum(CaType),
    name: slugSchema({
      field: "Name"
    }),
    enableDirectIssuance: z.boolean(),
    status: z.nativeEnum(CaStatus),
    configuration: z.object({
      dnsAppConnection: z.object({
        id: z.string(),
        name: z.string()
      }),
      // currently specific to Route53 but can be extended to others by differentiating via the provider property
      dnsProviderConfig: z.object({
        provider: z.nativeEnum(AcmeDnsProvider),
        hostedZoneId: z.string()
      }),
      directoryUrl: z.string(),
      accountEmail: z.string()
    })
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["ca"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["ca"]>, state?: boolean) => void;
};

const caTypes = [{ label: "ACME", value: CaType.ACME }];

export const ExternalCaModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();

  const { data: ca } = useGetCa({
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
    resolver: zodResolver(schema),
    defaultValues: {
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
    }
  });

  const caType = watch("type");
  const dnsProvider = watch("configuration.dnsProviderConfig.provider");

  const { data: availableConnections, isPending } = useListAvailableAppConnections(
    AppConnection.AWS,
    {
      enabled: dnsProvider === AcmeDnsProvider.ROUTE53
    }
  );

  useEffect(() => {
    if (ca) {
      if (ca.type !== CaType.INTERNAL && availableConnections?.length) {
        const selectedConnection = availableConnections?.find(
          (connection) => connection.id === ca?.configuration.dnsAppConnectionId
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
      }
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
  }, [ca, availableConnections]);

  const onFormSubmit = async ({
    type,
    name,
    enableDirectIssuance,
    status,
    configuration
  }: FormData) => {
    try {
      if (!currentWorkspace?.slug) return;

      if (ca && type !== CaType.INTERNAL) {
        await updateMutateAsync({
          caName: ca.name,
          projectId: currentWorkspace.id,
          name,
          type,
          status,
          enableDirectIssuance,
          configuration: {
            ...configuration,
            dnsAppConnectionId: configuration.dnsAppConnection.id
          }
        });
      } else {
        await createMutateAsync({
          projectId: currentWorkspace.id,
          name,
          type,
          status,
          enableDirectIssuance,
          configuration: {
            ...configuration,
            dnsAppConnectionId: configuration.dnsAppConnection.id
          }
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
      <ModalContent title={`${ca ? "View" : "Create"} External CA`}>
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
                      <SelectItem
                        value={String(AcmeDnsProvider.ROUTE53)}
                        key={AcmeDnsProvider.ROUTE53}
                      >
                        Route53
                      </SelectItem>
                    </Select>
                  </FormControl>
                )}
              />
              <Controller
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    tooltipText={`${dnsProvider === AcmeDnsProvider.ROUTE53 ? "Route53" : ""} requires an AWS App Connection. This can be created from the Organization Settings page.`}
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
