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
  SecretInput,
  Select,
  SelectItem,
  Switch,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionSubjects } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { gatewaysQueryKeys, useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { slugSchema } from "@app/lib/schemas";

import { MetadataForm } from "../MetadataForm";

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
      port: z.number(),
      database: z.string().min(1),
      username: z.string().min(1),
      password: z.string().min(1),
      passwordRequirements: passwordRequirementsSchema.optional(),
      masterCreationStatement: z.string().min(1),
      creationStatement: z.string().min(1),
      revocationStatement: z.string().min(1),
      renewStatement: z.string().optional(),
      ca: z.string().optional(),
      sslEnabled: z.boolean().optional(),
      gatewayId: z.string().optional()
    })
    .partial(),
  defaultTTL: z.string().superRefine((val, ctx) => {
    const valMs = ms(val);
    if (valMs < 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
    if (valMs > ms("10y"))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
  }),
  maxTTL: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      const valMs = ms(val);
      if (valMs < 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
      if (valMs > ms("10y"))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
    }),
  newName: slugSchema().optional(),
  metadata: z
    .object({
      key: z.string().trim().min(1),
      value: z.string().trim().default("")
    })
    .array()
    .optional(),
  usernameTemplate: z.string().nullable().optional()
});

type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  projectSlug: string;
  environment: string;
};

export const EditDynamicSecretAzureSqlDatabaseForm = ({
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
    formState: { isSubmitting },
    handleSubmit,
    watch
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      defaultTTL: dynamicSecret.defaultTTL,
      maxTTL: dynamicSecret.maxTTL || "",
      newName: dynamicSecret.name,
      metadata: dynamicSecret.metadata?.map((item) => ({ key: item.key, value: item.value })) || [],
      usernameTemplate: dynamicSecret?.usernameTemplate || "{{randomUsername}}",
      inputs: {
        ...(dynamicSecret.inputs as TForm["inputs"]),
        passwordRequirements:
          (dynamicSecret.inputs as TForm["inputs"])?.passwordRequirements ||
          getDefaultPasswordRequirements()
      }
    }
  });

  const updateDynamicSecret = useUpdateDynamicSecret();
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());
  const sslEnabled = watch("inputs.sslEnabled");

  const handleUpdateDynamicSecret = async ({
    inputs,
    maxTTL,
    defaultTTL,
    newName,
    metadata,
    usernameTemplate
  }: TForm) => {
    if (updateDynamicSecret.isPending) return;

    const isDefaultUsernameTemplate = usernameTemplate === "{{randomUsername}}";
    await updateDynamicSecret.mutateAsync({
      projectSlug,
      environmentSlug: environment,
      path: secretPath,
      name: dynamicSecret.name,
      data: {
        maxTTL: maxTTL || undefined,
        defaultTTL,
        inputs: inputs ? { ...inputs, masterDatabase: "master" } : undefined,
        newName: newName === dynamicSecret.name ? undefined : newName,
        metadata,
        usernameTemplate: !usernameTemplate || isDefaultUsernameTemplate ? null : usernameTemplate
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
          <MetadataForm control={control} />
          <div>
            <div className="mt-4 mb-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
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
                              value={value}
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
                      className="grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} placeholder="server.database.windows.net" />
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
              </div>
              <div className="flex items-center space-x-2">
                <div className="grow">
                  <Controller
                    control={control}
                    name="inputs.username"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="User"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input {...field} autoComplete="off" />
                      </FormControl>
                    )}
                  />
                </div>
                <div className="grow">
                  <Controller
                    control={control}
                    name="inputs.password"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Password"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input {...field} type="password" autoComplete="new-password" />
                      </FormControl>
                    )}
                  />
                </div>
                <div className="grow">
                  <Controller
                    control={control}
                    name="inputs.database"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="Database"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input {...field} placeholder="mydatabase" />
                      </FormControl>
                    )}
                  />
                </div>
              </div>
              <div>
                <div className="mt-2 mb-2">
                  <Controller
                    control={control}
                    name="inputs.sslEnabled"
                    render={({ field: { value, onChange }, fieldState: { error } }) => (
                      <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                        <Switch
                          className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                          id="azure-sql-edit-ssl-enabled"
                          thumbClassName="bg-mineshaft-800"
                          isChecked={value}
                          onCheckedChange={onChange}
                        >
                          Encrypt Connection (SSL)
                        </Switch>
                      </FormControl>
                    )}
                  />
                </div>
                {sslEnabled && (
                  <Controller
                    control={control}
                    name="inputs.ca"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isOptional
                        label="CA (SSL)"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <SecretInput
                          {...field}
                          containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                        />
                      </FormControl>
                    )}
                  />
                )}
                <Accordion type="multiple" className="mb-2 w-full bg-mineshaft-700">
                  <AccordionItem value="advanced">
                    <AccordionTrigger>
                      Creation, Revocation & Renew Statements (optional)
                    </AccordionTrigger>
                    <AccordionContent>
                      <Controller
                        control={control}
                        name="usernameTemplate"
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
                              placeholder="{{randomUsername}}"
                            />
                          </FormControl>
                        )}
                      />
                      <div className="mb-4 text-sm text-mineshaft-300">
                        Customize SQL statements for managing Azure SQL Database user lifecycle
                      </div>
                      <Controller
                        control={control}
                        name="inputs.masterCreationStatement"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Master Creation Statement"
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            helperText="Statement to create login in master database"
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
                        name="inputs.creationStatement"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Creation Statement"
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            helperText="Statement to create user in target database and grant permissions"
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
                            helperText="Statement to drop user and login"
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
                        name="inputs.renewStatement"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Renew Statement"
                            helperText="username and expiration are dynamically provisioned"
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
                <Accordion type="multiple" className="mt-4 mb-2 w-full bg-mineshaft-700">
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
            Save Changes
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
