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
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { SmbConnectionMethod, TSmbConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TSmbConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

// Character validation regex patterns (must match backend validation)
const HOSTNAME_REGEX = /^[a-zA-Z0-9.-]+$/;
const DOMAIN_REGEX = /^[a-zA-Z0-9._-]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]+$/;

// Dangerous characters that could enable command/RPC injection
const DANGEROUS_PASSWORD_CHARS = [";", "|", "&", "`", "$", "(", ")", "\n", "\r", "\0"];

const validatePassword = (password: string): boolean => {
  return !DANGEROUS_PASSWORD_CHARS.some((char) => password.includes(char));
};

const formSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.SMB),
  method: z.literal(SmbConnectionMethod.Credentials),
  credentials: z.object({
    host: z
      .string()
      .trim()
      .min(1, "Host required")
      .max(253, "Host too long")
      .refine((val) => HOSTNAME_REGEX.test(val), {
        message: "Host can only contain alphanumeric characters, dots, and hyphens"
      })
      .refine((val) => !val.startsWith("-") && !val.startsWith("."), {
        message: "Host cannot start with a hyphen or period"
      }),
    port: z.coerce.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
    domain: z
      .string()
      .trim()
      .max(255, "Domain too long")
      .refine((val) => val === "" || DOMAIN_REGEX.test(val), {
        message: "Domain can only contain alphanumeric characters, dots, hyphens, and underscores"
      })
      .refine((val) => val === "" || (!val.startsWith("-") && !val.startsWith(".")), {
        message: "Domain cannot start with a hyphen or period"
      })
      .optional(),
    username: z
      .string()
      .trim()
      .min(1, "Username required")
      .max(104, "Username too long")
      .refine((val) => USERNAME_REGEX.test(val), {
        message: "Username can only contain alphanumeric characters, underscores, hyphens, and periods"
      })
      .refine((val) => !val.startsWith("-") && !val.startsWith(".") && !val.endsWith("."), {
        message: "Username cannot start with a hyphen or period, and cannot end with a period"
      }),
    password: z
      .string()
      .min(1, "Password required")
      .refine((val) => validatePassword(val), {
        message: "Password cannot contain the following characters: ; | & ` $ ( ) or newlines"
      })
  })
});

type FormData = z.infer<typeof formSchema>;

export const SmbConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          credentials: {
            ...appConnection.credentials,
            password: ""
          }
        }
      : {
          app: AppConnection.SMB,
          method: SmbConnectionMethod.Credentials,
          gatewayId: null,
          credentials: {
            host: "",
            port: 445,
            domain: "",
            username: "",
            password: ""
          }
        }
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  const { subscription } = useSubscription();
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

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
        <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3 pb-0">
          <Controller
            name="credentials.host"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Host"
              >
                <Input {...field} placeholder="Hostname or IP address of Windows server" />
              </FormControl>
            )}
          />
          <Controller
            name="credentials.port"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Port"
              >
                <Input
                  type="number"
                  value={value}
                  onChange={(e) => onChange(e.target.value ? Number(e.target.value) : 445)}
                  placeholder="445"
                />
              </FormControl>
            )}
          />
          <Controller
            name="credentials.domain"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Domain"
                isOptional
              >
                <Input {...field} placeholder="e.g., MYDOMAIN (for domain-joined servers)" />
              </FormControl>
            )}
          />
          <Controller
            name="credentials.username"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Username"
              >
                <Input {...field} placeholder="Administrator" />
              </FormControl>
            )}
          />
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
            {isUpdate
              ? "Update Credentials"
              : `Connect to ${APP_CONNECTION_MAP[AppConnection.SMB].name}`}
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
