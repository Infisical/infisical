import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { slugSchema } from "@app/lib/schemas";

enum ConfigType {
  URL = "url",
  MANUAL = "manual"
}

enum TotpAlgorithm {
  SHA1 = "sha1",
  SHA256 = "sha256",
  SHA512 = "sha512"
}

const formSchema = z.object({
  inputs: z
    .discriminatedUnion("configType", [
      z.object({
        configType: z.literal(ConfigType.URL),
        url: z
          .string()
          .url()
          .trim()
          .min(1)
          .refine((val) => {
            const urlObj = new URL(val);
            const secret = urlObj.searchParams.get("secret");

            return Boolean(secret);
          }, "OTP URL must contain secret field")
      }),
      z.object({
        configType: z.literal(ConfigType.MANUAL),
        secret: z
          .string()
          .trim()
          .min(1)
          .transform((val) => val.replace(/\s+/g, "")),
        period: z.number().optional(),
        algorithm: z.nativeEnum(TotpAlgorithm).optional(),
        digits: z.number().optional()
      })
    ])
    .optional(),
  newName: slugSchema().optional()
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  projectSlug: string;
  environment: string;
};

export const EditDynamicSecretTotpForm = ({
  onClose,
  dynamicSecret,
  environment,
  secretPath,
  projectSlug
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    watch,
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      newName: dynamicSecret.name,
      inputs: dynamicSecret.inputs as TForm["inputs"]
    }
  });

  const selectedConfigType = watch("inputs.configType");
  const updateDynamicSecret = useUpdateDynamicSecret();

  const handleUpdateDynamicSecret = async ({ inputs, newName }: TForm) => {
    // wait till previous request is finished
    if (updateDynamicSecret.isPending) return;
    try {
      await updateDynamicSecret.mutateAsync({
        name: dynamicSecret.name,
        path: secretPath,
        projectSlug,
        environmentSlug: environment,
        data: {
          inputs,
          newName: newName === dynamicSecret.name ? undefined : newName
        }
      });
      onClose();
      createNotification({
        type: "success",
        text: "Successfully updated dynamic secret"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update dynamic secret"
      });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleUpdateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="flex-grow">
              <Controller
                control={control}
                defaultValue=""
                name="newName"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Secret Name"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="dynamic-secret" />
                  </FormControl>
                )}
              />
            </div>
          </div>
          <div>
            <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Configuration
            </div>
            <div className="flex flex-col">
              <Controller
                control={control}
                name="inputs.configType"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Configuration Type"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    className="w-full"
                  >
                    <Select
                      defaultValue={field.value}
                      {...field}
                      className="w-full"
                      onValueChange={(val) => {
                        field.onChange(val);
                      }}
                      dropdownContainerClassName="max-w-full"
                    >
                      <SelectItem value={ConfigType.URL} key="config-type-url">
                        URL
                      </SelectItem>
                      <SelectItem value={ConfigType.MANUAL} key="config-type-manual">
                        Manual
                      </SelectItem>
                    </Select>
                  </FormControl>
                )}
              />
              {selectedConfigType === ConfigType.URL && (
                <Controller
                  control={control}
                  name="inputs.url"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="OTP URL"
                      className="flex-grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
              )}
              {selectedConfigType === ConfigType.MANUAL && (
                <>
                  <Controller
                    control={control}
                    name="inputs.secret"
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Secret Key"
                        className="flex-grow"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input {...field} />
                      </FormControl>
                    )}
                  />
                  <div className="flex flex-row gap-2">
                    <Controller
                      control={control}
                      name="inputs.period"
                      defaultValue={30}
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Period"
                          className="flex-grow"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                        >
                          <Input
                            {...field}
                            type="number"
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                      )}
                    />
                    <Controller
                      control={control}
                      name="inputs.digits"
                      defaultValue={6}
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Digits"
                          className="flex-grow"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                        >
                          <Input
                            {...field}
                            type="number"
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                      )}
                    />
                    <Controller
                      control={control}
                      name="inputs.algorithm"
                      defaultValue={TotpAlgorithm.SHA1}
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Algorithm"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                          className="w-full"
                        >
                          <Select
                            defaultValue={field.value}
                            {...field}
                            className="w-full"
                            dropdownContainerClassName="max-w-full"
                            onValueChange={(val) => {
                              field.onChange(val);
                            }}
                          >
                            <SelectItem value={TotpAlgorithm.SHA1} key="algorithm-sha-1">
                              SHA1
                            </SelectItem>
                            <SelectItem value={TotpAlgorithm.SHA256} key="algorithm-sha-256">
                              SHA256
                            </SelectItem>
                            <SelectItem value={TotpAlgorithm.SHA512} key="algorithm-sha-512">
                              SHA512
                            </SelectItem>
                          </Select>
                        </FormControl>
                      )}
                    />
                  </div>
                  <p className="mb-8 text-sm font-normal text-gray-400">
                    The period, digits, and algorithm values can remain at their defaults unless
                    your TOTP provider specifies otherwise.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Submit
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
