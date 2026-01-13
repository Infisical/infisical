import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  FormControl,
  Input,
  ModalClose,
  SecretInput,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionSubjects, useSubscription } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { SshConnectionMethod, TSshConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TSshConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.SSH)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(SshConnectionMethod.Password),
    credentials: z.object({
      host: z.string().trim().min(1, "Host required"),
      port: z.coerce.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    })
  }),
  rootSchema.extend({
    method: z.literal(SshConnectionMethod.SshKey),
    credentials: z.object({
      host: z.string().trim().min(1, "Host required"),
      port: z.coerce.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
      username: z.string().trim().min(1, "Username required"),
      privateKey: z.string().trim().min(1, "Private key required"),
      passphrase: z.string().trim().optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const SshConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          credentials: {
            ...appConnection.credentials,
            ...(appConnection.method === SshConnectionMethod.Password
              ? { password: "" }
              : { privateKey: "", passphrase: "" })
          }
        }
      : {
          app: AppConnection.SSH,
          method: SshConnectionMethod.Password,
          gatewayId: null,
          credentials: {
            host: "",
            port: 22,
            username: "",
            password: ""
          }
        }
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
    watch,
    setValue
  } = form;

  const selectedMethod = watch("method");
  const { subscription } = useSubscription();
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

  const handleMethodChange = (newMethod: SshConnectionMethod) => {
    const currentCredentials = form.getValues("credentials");

    if (newMethod === SshConnectionMethod.Password) {
      setValue("method", SshConnectionMethod.Password);
      setValue("credentials", {
        host: currentCredentials.host,
        port: currentCredentials.port,
        username: currentCredentials.username,
        password: ""
      });
    } else {
      setValue("method", SshConnectionMethod.SshKey);
      setValue("credentials", {
        host: currentCredentials.host,
        port: currentCredentials.port,
        username: currentCredentials.username,
        privateKey: "",
        passphrase: ""
      });
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        {subscription.gateway && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Controller
                control={control}
                name="gatewayId"
                defaultValue=""
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    label="Gateway"
                  >
                    <Tooltip
                      isDisabled={isAllowed}
                      content="Restricted access. You don't have permission to attach gateways to resources."
                    >
                      <div>
                        <Select
                          isDisabled={!isAllowed}
                          value={value as string}
                          onValueChange={onChange}
                          className="w-full border border-mineshaft-500"
                          dropdownContainerClassName="max-w-none"
                          isLoading={isGatewaysLoading}
                          placeholder="Default: Internet Gateway"
                          position="popper"
                        >
                          <SelectItem
                            value={null as unknown as string}
                            onClick={() => onChange(undefined)}
                          >
                            Internet Gateway
                          </SelectItem>
                          {gateways?.map((el) => (
                            <SelectItem value={el.id} key={el.id}>
                              {el.name}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>
                    </Tooltip>
                  </FormControl>
                )}
              />
            )}
          </OrgPermissionCan>
        )}
        <Controller
          name="method"
          control={control}
          render={({ field: { value }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The authentication method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.SSH].name
              }. This field cannot be changed after creation.`}
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Authentication Method"
            >
              <Select
                isDisabled={isUpdate}
                value={value}
                onValueChange={(val) => handleMethodChange(val as SshConnectionMethod)}
                className="w-full border border-mineshaft-500"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.values(SshConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />
        <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3 pb-0">
          <div className="grid grid-cols-2 gap-2">
            <Controller
              name="credentials.host"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Host"
                >
                  <Input {...field} placeholder="hostname or IP address" />
                </FormControl>
              )}
            />
            <Controller
              name="credentials.port"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Port"
                >
                  <Input {...field} type="number" placeholder="22" />
                </FormControl>
              )}
            />
          </div>
          <Controller
            name="credentials.username"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Username"
              >
                <Input {...field} placeholder="SSH username" />
              </FormControl>
            )}
          />
          {selectedMethod === SshConnectionMethod.Password ? (
            <Controller
              name="credentials.password"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Password"
                >
                  <SecretInput
                    containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                </FormControl>
              )}
            />
          ) : (
            <>
              <Controller
                name="credentials.privateKey"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="Private Key"
                  >
                    <SecretInput
                      containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    />
                  </FormControl>
                )}
              />
              <Controller
                name="credentials.passphrase"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="Passphrase"
                    isOptional
                  >
                    <SecretInput
                      containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                      value={value ?? ""}
                      onChange={(e) => onChange(e.target.value)}
                    />
                  </FormControl>
                )}
              />
            </>
          )}
        </div>
        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : "Connect to SSH"}
          </Button>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};
