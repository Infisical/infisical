import { Controller, FieldValues, useFieldArray, useForm } from "react-hook-form";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton, Input } from "@app/components/v2";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

const validateTTL = (val: string, ctx: z.RefinementCtx) => {
  if (!val) return;
  const valMs = ms(val);
  if (valMs === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid TTL format" });
    return;
  }
  if (valMs < 1000)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1 second" });
  if (valMs > 60 * 60 * 1000)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 1 hour" });
};

const formSchema = z
  .object({
    inputs: z.object({
      serviceAccountEmail: z.string().email().trim().min(1, "Service account email required"),
      tokenScopes: z.array(z.string().trim().min(1)).min(1, "At least one scope is required")
    }),
    defaultTTL: z.string().superRefine(validateTTL),
    maxTTL: z
      .string()
      .optional()
      .superRefine((val, ctx) => {
        if (val) validateTTL(val, ctx);
      }),
    newName: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase")
  })
  .refine((d) => !d.maxTTL || ms(d.maxTTL)! >= ms(d.defaultTTL)!, {
    path: ["maxTTL"],
    message: "Max TTL must be greater than or equal to Default TTL"
  });
type TForm = z.infer<typeof formSchema> & FieldValues;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  environment: string;
  projectSlug: string;
};
export const EditDynamicSecretGcpIamForm = ({
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
      defaultTTL: dynamicSecret.defaultTTL,
      maxTTL: dynamicSecret.maxTTL,
      newName: dynamicSecret.name,
      inputs: {
        ...(dynamicSecret.inputs as TForm["inputs"]),
        tokenScopes: (dynamicSecret.inputs as TForm["inputs"]).tokenScopes ?? [
          "https://www.googleapis.com/auth/iam",
          "https://www.googleapis.com/auth/cloud-platform"
        ]
      }
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "inputs.tokenScopes"
  });

  const updateDynamicSecret = useUpdateDynamicSecret();

  const handleUpdateDynamicSecret = async ({ inputs, maxTTL, defaultTTL, newName }: TForm) => {
    // wait till previous request is finished
    if (updateDynamicSecret.isPending) return;
    await updateDynamicSecret.mutateAsync({
      name: dynamicSecret.name,
      path: secretPath,
      projectSlug,
      environmentSlug: environment,
      data: {
        maxTTL: maxTTL || undefined,
        defaultTTL,
        inputs,
        newName: newName === dynamicSecret.name ? undefined : newName
      }
    });
    onClose();
    createNotification({
      type: "success",
      text: "Successfully updated dynamic secret"
    });
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleUpdateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="grow">
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
              <Controller
                control={control}
                name="defaultTTL"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label={<TtlFormLabel label="Default TTL" />}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
            </div>
            <div className="w-32">
              <Controller
                control={control}
                name="maxTTL"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label={<TtlFormLabel label="Max TTL" />}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
            </div>
          </div>
          <div>
            <div className="mt-4 mb-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Configuration
            </div>

            <Controller
              control={control}
              name="inputs.serviceAccountEmail"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Service Account Email"
                  className="grow"
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <Input {...field} />
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="inputs.tokenScopes"
              render={({ fieldState: { error } }) => (
                <FormControl
                  label="Token Scopes"
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                  helperText="OAuth scopes granted to the generated access token. Scopes can only be narrowed after issuance, never widened."
                >
                  <div className="space-y-2">
                    {fields.map((field, index) => (
                      <Controller
                        key={field.id}
                        control={control}
                        name={`inputs.tokenScopes.${index}`}
                        render={({ field: itemField, fieldState: { error: itemError } }) => (
                          <FormControl
                            isError={Boolean(itemError?.message)}
                            errorText={itemError?.message}
                            className="mb-0"
                          >
                            <div className="flex items-center space-x-2">
                              <Input
                                {...itemField}
                                placeholder="https://www.googleapis.com/auth/cloud-platform"
                                className="grow"
                              />
                              <IconButton
                                onClick={() => remove(index)}
                                variant="outline_bg"
                                ariaLabel="Remove scope"
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </IconButton>
                            </div>
                          </FormControl>
                        )}
                      />
                    ))}
                    <Button variant="outline_bg" onClick={() => append("")} type="button">
                      Add Scope
                    </Button>
                  </div>
                </FormControl>
              )}
            />
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
