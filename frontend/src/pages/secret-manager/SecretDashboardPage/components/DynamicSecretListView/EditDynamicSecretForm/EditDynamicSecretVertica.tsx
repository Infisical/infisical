import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  FormControl,
  Input,
  Select,
  SelectItem,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionSubjects } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { gatewaysQueryKeys, useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

const passwordRequirementsSchema = z
  .object({
    length: z.number().min(1).max(250),
    required: z
      .object({
        lowercase: z.number().min(0),
        uppercase: z.number().min(0),
        digits: z.number().min(0),
        symbols: z.number().min(0)
      })
      .refine((data) => {
        const total = Object.values(data).reduce((sum, count) => sum + count, 0);
        return total <= 250;
      }, "Sum of required characters cannot exceed 250"),
    allowedSymbols: z.string().optional()
  })
  .refine((data) => {
    const total = Object.values(data.required).reduce((sum, count) => sum + count, 0);
    return total <= data.length;
  }, "Sum of required characters cannot exceed the total length");

const formSchema = z.object({
  inputs: z
    .object({
      host: z.string().toLowerCase().min(1),
      port: z.coerce.number(),
      database: z.string().min(1),
      username: z.string().min(1),
      password: z.string().min(1),
      passwordRequirements: passwordRequirementsSchema.optional(),
      creationStatement: z.string().min(1),
      revocationStatement: z.string().min(1),
      gatewayId: z.string().optional().nullable()
    })
    .partial(),
  defaultTTL: z.string().superRefine((val, ctx) => {
    const valMs = ms(val);
    if (valMs < 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
    if (valMs > 24 * 60 * 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
  }),
  usernameTemplate: z.string().trim().nullable().optional(),
  maxTTL: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      const valMs = ms(val);
      if (valMs < 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
      if (valMs > 24 * 60 * 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
    }),
  newName: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase")
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  projectSlug: string;
  environment: string;
};

export const EditDynamicSecretVerticaForm = ({
  onClose,
  dynamicSecret,
  environment,
  secretPath,
  projectSlug
}: Props) => {
  const getDefaultPasswordRequirements = () => ({
    length: 48,
    required: {
      lowercase: 1,
      uppercase: 1,
      digits: 1,
      symbols: 0
    },
    allowedSymbols: "-_.~!*"
  });

  const {
    control,
    watch,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      defaultTTL: dynamicSecret.defaultTTL,
      maxTTL: dynamicSecret.maxTTL,
      newName: dynamicSecret.name,
      usernameTemplate: dynamicSecret?.usernameTemplate || "{{randomUsername}}",
      inputs: {
        ...(dynamicSecret.inputs as TForm["inputs"]),
        passwordRequirements:
          (dynamicSecret.inputs as TForm["inputs"])?.passwordRequirements ||
          getDefaultPasswordRequirements()
      }
    }
  });

  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());
  const updateDynamicSecret = useUpdateDynamicSecret();

  const selectedGatewayId = watch("inputs.gatewayId");
  const isGatewayInActive = gateways?.findIndex((el) => el.id === selectedGatewayId) === -1;

  const handleUpdateDynamicSecret = async ({
    inputs,
    maxTTL,
    defaultTTL,
    newName,
    usernameTemplate
  }: TForm) => {
    if (updateDynamicSecret.isPending) return;

    const isDefaultUsernameTemplate = usernameTemplate === "{{randomUsername}}";
    try {
      await updateDynamicSecret.mutateAsync({
        name: dynamicSecret.name,
        path: secretPath,
        projectSlug,
        environmentSlug: environment,
        data: {
          maxTTL: maxTTL || undefined,
          defaultTTL,
          inputs: {
            ...inputs,
            gatewayId: isGatewayInActive ? null : inputs.gatewayId
          },
          newName: newName === dynamicSecret.name ? undefined : newName,
          usernameTemplate: !usernameTemplate || isDefaultUsernameTemplate ? null : usernameTemplate
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
            <div className="w-32">
              <Controller
                control={control}
                name="defaultTTL"
                defaultValue="1h"
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
                defaultValue="24h"
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
            <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Configuration
            </div>
            <div>
              <OrgPermissionCan
                I={OrgGatewayPermissionActions.AttachGateways}
                a={OrgPermissionSubjects.Gateway}
              >
                {(isAllowed) => (
                  <Controller
                    control={control}
                    name="inputs.gatewayId"
                    defaultValue=""
                    render={({ field: { value, onChange }, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message) || isGatewayInActive}
                        errorText={
                          isGatewayInActive && selectedGatewayId
                            ? `Project Gateway ${selectedGatewayId} is removed`
                            : error?.message
                        }
                        label="Gateway"
                        helperText=""
                      >
                        <Tooltip
                          isDisabled={isAllowed}
                          content="Restricted access. You don't have permission to attach gateways to resources."
                        >
                          <div>
                            <Select
                              isDisabled={!isAllowed}
                              value={value || undefined}
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
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <Controller
                  control={control}
                  name="inputs.host"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Host"
                      className="flex-grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="inputs.port"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Port"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="number" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="inputs.database"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Database"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="text" />
                    </FormControl>
                  )}
                />
              </div>
              <div className="flex w-full items-center space-x-2">
                <Controller
                  control={control}
                  name="inputs.username"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      className="w-full"
                      label="User"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} autoComplete="off" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="inputs.password"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      className="w-full"
                      label="Password"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="password" autoComplete="new-password" />
                    </FormControl>
                  )}
                />
              </div>
              <div>
                <Accordion type="multiple" className="mb-2 w-full bg-mineshaft-700">
                  <AccordionItem value="advance-statements">
                    <AccordionTrigger>Modify SQL Statements</AccordionTrigger>
                    <AccordionContent>
                      <Controller
                        control={control}
                        name="usernameTemplate"
                        defaultValue=""
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Username Template"
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                          >
                            <Input
                              {...field}
                              value={field.value || undefined}
                              className="border-mineshaft-600 bg-mineshaft-900 text-sm"
                            />
                          </FormControl>
                        )}
                      />
                      <Controller
                        control={control}
                        name="inputs.creationStatement"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Creation Statement"
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                          >
                            <TextArea
                              {...field}
                              reSize="none"
                              rows={3}
                              className="border-mineshaft-600 bg-mineshaft-900 text-sm"
                            />
                          </FormControl>
                        )}
                      />
                      <Controller
                        control={control}
                        name="inputs.revocationStatement"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Revocation Statement"
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                          >
                            <TextArea
                              {...field}
                              reSize="none"
                              rows={3}
                              className="border-mineshaft-600 bg-mineshaft-900 text-sm"
                            />
                          </FormControl>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <Accordion type="multiple" className="mb-2 mt-4 w-full bg-mineshaft-700">
                  <AccordionItem value="password-config">
                    <AccordionTrigger>Password Configuration (optional)</AccordionTrigger>
                    <AccordionContent>
                      <div className="mb-4 text-sm text-mineshaft-300">
                        Set constraints on the generated database password
                      </div>
                      <div className="space-y-4">
                        <div>
                          <Controller
                            control={control}
                            name="inputs.passwordRequirements.length"
                            defaultValue={48}
                            render={({ field, fieldState: { error } }) => (
                              <FormControl
                                label="Password Length"
                                isError={Boolean(error)}
                                errorText={error?.message}
                              >
                                <Input
                                  type="number"
                                  min={1}
                                  max={250}
                                  {...field}
                                  onChange={(e) => field.onChange(Number(e.target.value))}
                                />
                              </FormControl>
                            )}
                          />
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Minimum Required Character Counts</h4>
                          <div className="text-sm text-gray-500">
                            {(() => {
                              const total = Object.values(
                                watch("inputs.passwordRequirements.required") || {}
                              ).reduce((sum, count) => sum + Number(count || 0), 0);
                              const length = watch("inputs.passwordRequirements.length") || 0;
                              const isError = total > length;
                              return (
                                <span className={isError ? "text-red-500" : ""}>
                                  Total required characters: {total}{" "}
                                  {isError ? `(exceeds length of ${length})` : ""}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <Controller
                              control={control}
                              name="inputs.passwordRequirements.required.lowercase"
                              defaultValue={1}
                              render={({ field, fieldState: { error } }) => (
                                <FormControl
                                  label="Lowercase Count"
                                  isError={Boolean(error)}
                                  errorText={error?.message}
                                  helperText="Minimum number of lowercase letters"
                                >
                                  <Input
                                    type="number"
                                    min={0}
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                              )}
                            />
                            <Controller
                              control={control}
                              name="inputs.passwordRequirements.required.uppercase"
                              defaultValue={1}
                              render={({ field, fieldState: { error } }) => (
                                <FormControl
                                  label="Uppercase Count"
                                  isError={Boolean(error)}
                                  errorText={error?.message}
                                  helperText="Minimum number of uppercase letters"
                                >
                                  <Input
                                    type="number"
                                    min={0}
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                              )}
                            />
                            <Controller
                              control={control}
                              name="inputs.passwordRequirements.required.digits"
                              defaultValue={1}
                              render={({ field, fieldState: { error } }) => (
                                <FormControl
                                  label="Digit Count"
                                  isError={Boolean(error)}
                                  errorText={error?.message}
                                  helperText="Minimum number of digits"
                                >
                                  <Input
                                    type="number"
                                    min={0}
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                              )}
                            />
                            <Controller
                              control={control}
                              name="inputs.passwordRequirements.required.symbols"
                              defaultValue={0}
                              render={({ field, fieldState: { error } }) => (
                                <FormControl
                                  label="Symbol Count"
                                  isError={Boolean(error)}
                                  errorText={error?.message}
                                  helperText="Minimum number of symbols"
                                >
                                  <Input
                                    type="number"
                                    min={0}
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                              )}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Allowed Symbols</h4>
                          <Controller
                            control={control}
                            name="inputs.passwordRequirements.allowedSymbols"
                            defaultValue="-_.~!*"
                            render={({ field, fieldState: { error } }) => (
                              <FormControl
                                label="Symbols to use in password"
                                isError={Boolean(error)}
                                errorText={error?.message}
                                helperText="Default: -_.~!*"
                              >
                                <Input {...field} placeholder="-_.~!*" />
                              </FormControl>
                            )}
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
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
