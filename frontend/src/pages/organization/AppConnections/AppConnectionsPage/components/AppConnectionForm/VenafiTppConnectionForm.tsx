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
import { useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { TVenafiTppConnection, VenafiTppConnectionMethod } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TVenafiTppConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.VenafiTpp)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(VenafiTppConnectionMethod.UsernamePassword),
    credentials: z.object({
      tppUrl: z
        .string()
        .trim()
        .min(1, "TPP URL required")
        .refine((value) => value.startsWith("https://"), "TPP URL must use HTTPS"),
      clientId: z.string().trim().min(1, "Client ID required"),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const VenafiTppConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.VenafiTpp,
      method: VenafiTppConnectionMethod.UsernamePassword,
      name: "",
      description: "",
      gatewayId: null,
      credentials: {
        tppUrl: "",
        clientId: "",
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
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.VenafiTpp].name
              }. This field cannot be changed after creation.`}
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Method"
            >
              <Select
                isDisabled={isUpdate}
                value={value}
                onValueChange={(val) => onChange(val)}
                className="w-full border border-mineshaft-500"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.values(VenafiTppConnectionMethod).map((method) => {
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
        {subscription.gateway && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Controller
                control={control}
                name="gatewayId"
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
                    </Tooltip>
                  </FormControl>
                )}
              />
            )}
          </OrgPermissionCan>
        )}
        <Controller
          name="credentials.tppUrl"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="TPP URL"
            >
              <Input {...field} placeholder="https://tpp.example.com" />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.clientId"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Client ID"
              tooltipText="The OAuth Client ID registered in the Venafi TPP API Integration."
            >
              <Input {...field} placeholder="my-infisical-integration" />
            </FormControl>
          )}
        />
        <div className="grid grid-cols-2 gap-2">
          <Controller
            name="credentials.username"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Username"
              >
                <Input {...field} placeholder="admin@domain.com" />
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
            {isUpdate ? "Update Credentials" : "Connect to Venafi TPP"}
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
