import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { WorkspaceEnv } from "@app/hooks/api/types";
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
  provider: z.discriminatedUnion("configType", [
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
  ]),
  name: slugSchema(),
  environment: z.object({ name: z.string(), slug: z.string() })
});

type TForm = z.infer<typeof formSchema>;

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environments: WorkspaceEnv[];
  isSingleEnvironmentMode?: boolean;
};

export const TotpInputForm = ({
  onCompleted,
  onCancel,
  environments,
  secretPath,
  projectSlug,
  isSingleEnvironmentMode
}: Props) => {
  const {
    control,
    watch,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: {
        configType: ConfigType.URL
      },
      environment: isSingleEnvironmentMode ? environments[0] : undefined
    }
  });

  const selectedConfigType = watch("provider.configType");

  const createDynamicSecret = useCreateDynamicSecret();

  const handleCreateDynamicSecret = async ({ name, provider, environment }: TForm) => {
    // wait till previous request is finished
    if (createDynamicSecret.isPending) return;
    try {
      await createDynamicSecret.mutateAsync({
        provider: { type: DynamicSecretProviders.Totp, inputs: provider },
        maxTTL: "24h",
        name,
        path: secretPath,
        defaultTTL: "1m",
        projectSlug,
        environmentSlug: environment.slug
      });
      onCompleted();
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create dynamic secret"
      });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleCreateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="flex-grow">
              <Controller
                control={control}
                defaultValue=""
                name="name"
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
              <a
                href="https://infisical.com/docs/documentation/platform/dynamic-secrets/totp"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="mb-1 ml-2 inline-block rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.07rem] ml-1.5 text-xxs"
                  />
                </div>
              </a>
            </div>
            <div className="flex flex-col">
              <Controller
                control={control}
                name="provider.configType"
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
                  name="provider.url"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="OTP URL"
                      className="flex-grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} placeholder="otpauth://" />
                    </FormControl>
                  )}
                />
              )}
              {selectedConfigType === ConfigType.MANUAL && (
                <>
                  <Controller
                    control={control}
                    name="provider.secret"
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
                      name="provider.period"
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
                      name="provider.digits"
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
                      name="provider.algorithm"
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
              {!isSingleEnvironmentMode && (
                <Controller
                  control={control}
                  name="environment"
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      label="Environment"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <FilterableSelect
                        options={environments}
                        value={value}
                        onChange={onChange}
                        placeholder="Select the environment to create secret in..."
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.slug}
                        menuPlacement="top"
                      />
                    </FormControl>
                  )}
                />
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Submit
          </Button>
          <Button variant="outline_bg" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
