import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, FormLabel, Input, SecretInput, Tooltip } from "@app/components/v2";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

const formSchema = z.object({
  inputs: z.object({
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
  newName: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase")
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  environment: string;
  projectSlug: string;
};
export const EditDynamicSecretGithubForm = ({
  onClose,
  dynamicSecret,
  secretPath,
  environment,
  projectSlug
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      newName: dynamicSecret.name,
      inputs: {
        ...(dynamicSecret.inputs as TForm["inputs"])
      }
    }
  });

  const updateDynamicSecret = useUpdateDynamicSecret();

  const handleUpdateDynamicSecret = async ({ inputs, newName }: TForm) => {
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
    } catch {
      createNotification({
        type: "error",
        text: "Failed to update dynamic secret"
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
                name="inputs.appId"
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
                name="inputs.installationId"
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
                name="inputs.privateKey"
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
