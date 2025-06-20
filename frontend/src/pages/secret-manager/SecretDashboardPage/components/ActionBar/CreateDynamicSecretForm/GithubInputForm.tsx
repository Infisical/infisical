import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  FormLabel,
  Input,
  SecretInput,
  Tooltip
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { WorkspaceEnv } from "@app/hooks/api/types";

const formSchema = z.object({
  provider: z.object({
    appId: z.coerce.number().min(1, "Required"),
    installationId: z.coerce.number().min(1, "Required"),
    privateKey: z
      .string()
      .trim()
      .min(1, "Required")
      .refine(
        (val) =>
          /^-----BEGIN(?:(?: RSA| PGP| ENCRYPTED)? PRIVATE KEY)-----\s*[\s\S]*?-----END(?:(?: RSA| PGP| ENCRYPTED)? PRIVATE KEY)-----$/.test(
            val
          ),
        "Invalid PEM format for private key"
      )
  }),
  name: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase"),
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

export const GithubInputForm = ({
  onCompleted,
  onCancel,
  environments,
  secretPath,
  projectSlug,
  isSingleEnvironmentMode
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      environment: isSingleEnvironmentMode && environments.length > 0 ? environments[0] : undefined
    }
  });

  const createDynamicSecret = useCreateDynamicSecret();

  const handleCreateDynamicSecret = async ({ name, provider, environment }: TForm) => {
    if (createDynamicSecret.isPending) return;
    try {
      await createDynamicSecret.mutateAsync({
        provider: {
          type: DynamicSecretProviders.Github,
          inputs: {
            ...provider
          }
        },
        defaultTTL: "1h", // Github is limited to 1 hour tokens
        name,
        path: secretPath,
        projectSlug,
        environmentSlug: environment.slug
      });
      onCompleted();
    } catch {
      createNotification({
        type: "error",
        text: "Failed to create dynamic secret"
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
            <div className="w-32">
              <FormControl
                label={
                  <FormLabel
                    label="Default TTL"
                    icon={
                      <Tooltip content="Github token TTL is fixed to 1 hour">
                        <FontAwesomeIcon
                          icon={faQuestionCircle}
                          size="sm"
                          className="relative bottom-px right-1"
                        />
                      </Tooltip>
                    }
                  />
                }
              >
                <Input disabled value="1h" className="pointer-events-none opacity-50" />
              </FormControl>
            </div>
          </div>
          <div>
            <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Configuration
            </div>

            <div className="flex flex-col">
              <Controller
                control={control}
                name="provider.appId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="App ID"
                    className="flex-grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input placeholder="0000000" {...field} />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="provider.installationId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Installation ID"
                    className="flex-grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input placeholder="00000000" {...field} />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="provider.privateKey"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="App Private Key PEM"
                    className="flex-grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    isRequired
                  >
                    <SecretInput
                      {...field}
                      containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                    />
                  </FormControl>
                )}
              />
            </div>

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
