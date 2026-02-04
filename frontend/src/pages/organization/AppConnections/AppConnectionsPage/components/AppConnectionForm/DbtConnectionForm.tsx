import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FormControl,
  Input,
  ModalClose,
  SecretInput,
  Select,
  SelectItem
} from "@app/components/v2";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { DbtConnectionMethod, TDbtConnection } from "@app/hooks/api/appConnections/types";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TDbtConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Dbt)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(DbtConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "API Token required"),
      instanceUrl: z.string().trim().min(1, "Instance URL required"),
      accountId: z.string().trim().min(1, "Account ID required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const DbtConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Dbt,
      method: DbtConnectionMethod.ApiToken,
      credentials: {
        apiToken: "",
        instanceUrl: "",
        accountId: ""
      }
    }
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}

        <Controller
          name="credentials.instanceUrl"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Instance URL"
            >
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://bw255.us1.dbt.com"
              />
            </FormControl>
          )}
        />

        <Controller
          name="credentials.accountId"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Account ID"
            >
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="70471823527642"
              />
            </FormControl>
          )}
        />

        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The type of token you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.Dbt].name
              }. This field cannot be changed after creation.`}
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Token Type"
            >
              <Select
                isDisabled={isUpdate}
                value={value}
                onValueChange={(val) => onChange(val)}
                className="w-full border border-mineshaft-500"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.values(DbtConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />
        <Controller
          name="credentials.apiToken"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="API Token"
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            </FormControl>
          )}
        />

        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : "Connect to DBT"}
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
