import { Controller, useForm } from "react-hook-form";
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
import { APP_CONNECTION_MAP, APP_CONNECTION_METHOD_MAP } from "@app/helpers/appConnections";
import { AwsConnectionMethod, TAwsConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  appConnection?: TAwsConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = z.object({
  name: slugSchema({ min: 1, max: 32, field: "Name" }),
  app: z.literal(AppConnection.AWS)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(AwsConnectionMethod.AssumeRole),
    credentials: z.object({
      roleArn: z.string().min(1, "Role ARN required")
    })
  }),
  rootSchema.extend({
    method: z.literal(AwsConnectionMethod.AccessKey),
    credentials: z.object({
      accessKeyId: z.string().min(1, "Access Key ID required"),
      secretAccessKey: z.string().min(1, "Secret Access Key required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const AwsConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const {
    handleSubmit,
    register,
    control,
    watch,
    formState: { isSubmitting, errors, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.AWS,
      method: AwsConnectionMethod.AssumeRole
    }
  });

  const selectedMethod = watch("method");

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {!isUpdate && (
        <FormControl
          helperText="Name must be slug-friendly"
          errorText={errors.name?.message}
          isError={Boolean(errors.name?.message)}
          label="Name"
        >
          <Input
            autoFocus
            placeholder={`my-${AppConnection.AWS}-connection`}
            {...register("name")}
          />
        </FormControl>
      )}
      <Controller
        name="method"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipText={`The method you would like to use to connect with ${
              APP_CONNECTION_MAP[AppConnection.AWS].name
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
              {Object.values(AwsConnectionMethod).map((method) => {
                return (
                  <SelectItem value={method} key={method}>
                    {APP_CONNECTION_METHOD_MAP[method].name}{" "}
                    {method === AwsConnectionMethod.AssumeRole ? " (Recommended)" : ""}
                  </SelectItem>
                );
              })}
            </Select>
          </FormControl>
        )}
      />
      {selectedMethod === AwsConnectionMethod.AssumeRole ? (
        <Controller
          name="credentials.roleArn"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Role ARN"
              className="group"
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            </FormControl>
          )}
        />
      ) : (
        <>
          <Controller
            name="credentials.accessKeyId"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Access Key ID"
              >
                <Input
                  placeholder={"*".repeat(20)}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
              </FormControl>
            )}
          />
          <Controller
            name="credentials.secretAccessKey"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Secret Access Key"
                className="group"
              >
                <SecretInput
                  containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
              </FormControl>
            )}
          />
        </>
      )}
      <div className="mt-8 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          colorSchema="secondary"
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !isDirty}
        >
          {isUpdate ? "Update Credentials" : "Connect to AWS"}
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};
