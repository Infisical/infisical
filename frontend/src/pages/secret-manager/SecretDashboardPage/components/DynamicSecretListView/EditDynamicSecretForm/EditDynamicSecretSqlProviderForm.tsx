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
  TextArea,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionSubjects } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { gatewaysQueryKeys, useUpdateDynamicSecret } from "@app/hooks/api";
import { SqlProviders, TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
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
        return total <= 250; // Sanity check for individual validation
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
      client: z.nativeEnum(SqlProviders),
      host: z.string().toLowerCase().min(1),
      port: z.number(),
      database: z.string().min(1),
      username: z.string().min(1),
      password: z.string().min(1),
      passwordRequirements: passwordRequirementsSchema.optional(),
      creationStatement: z.string().min(1),
      revocationStatement: z.string().min(1),
      renewStatement: z.string().optional(),
      ca: z.string().optional(),
      gatewayId: z.string().optional().nullable()
    })
    .partial(),
  defaultTTL: z.string().superRefine((val, ctx) => {
    const valMs = ms(val);
    if (valMs < 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
    // a day
    if (valMs > 24 * 60 * 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
  }),
  maxTTL: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      const valMs = ms(val);
      if (valMs < 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
      // a day
      if (valMs > 24 * 60 * 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
    })
    .nullable(),
  newName: slugSchema().optional(),
  metadata: z
    .object({
      key: z.string().trim().min(1),
      value: z.string().trim().default("")
    })
    .array()
    .optional(),
  usernameTemplate: z.string().trim().nullable().optional()
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  environment: string;
  projectSlug: string;
};

export const EditDynamicSecretSqlProviderForm = ({
  onClose,
  dynamicSecret,
  environment,
  secretPath,
  projectSlug
}: Props) => {
  const getDefaultPasswordRequirements = (provider: SqlProviders) => ({
    length: provider === SqlProviders.Oracle ? 30 : 48,
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
      metadata: dynamicSecret.metadata,
      usernameTemplate: dynamicSecret?.usernameTemplate || "{{randomUsername}}",
      inputs: {
        ...(dynamicSecret.inputs as TForm["inputs"]),
        passwordRequirements:
          (dynamicSecret.inputs as TForm["inputs"])?.passwordRequirements ||
          getDefaultPasswordRequirements(
            (dynamicSecret.inputs as TForm["inputs"])?.client || SqlProviders.Postgres
          )
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
    metadata,
    usernameTemplate
  }: TForm) => {
    // wait till previous request is finished
    if (updateDynamicSecret.isPending) return;
    try {
      const isDefaultUsernameTemplate = usernameTemplate === "{{randomUsername}}";
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
          metadata,
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
                  <Input {...field} placeholder="DYN-1" />
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
                  <Input {...field} value={field.value || ""} />
                </FormControl>
              )}
            />
          </div>
        </div>
        <MetadataForm control={control} />
        <div>
          <div className="mb-4 border-b border-b-mineshaft-600 pb-2">Configuration</div>
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
            <Controller
              control={control}
              name="inputs.client"
              defaultValue={SqlProviders.Postgres}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                  <Select
                    isDisabled
                    value={value}
                    onValueChange={(val) => onChange(val)}
                    className="w-full border border-mineshaft-500"
                  >
                    <SelectItem value={SqlProviders.Postgres}>PostgreSQL</SelectItem>
                    <SelectItem value={SqlProviders.MySql}>MySQL</SelectItem>
                    <SelectItem value={SqlProviders.Oracle}>Oracle</SelectItem>
                    <SelectItem value={SqlProviders.MsSQL}>MS SQL</SelectItem>
                  </Select>
                </FormControl>
              )}
            />
            <div className="flex items-center space-x-2">
              <Controller
                control={control}
                name="inputs.host"
                defaultValue=""
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
                defaultValue={5432}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Port"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input
                      {...field}
                      type="number"
                      onChange={(el) => field.onChange(parseInt(el.target.value, 10))}
                    />
                  </FormControl>
                )}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Controller
                control={control}
                name="inputs.username"
                defaultValue=""
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
              <Controller
                control={control}
                name="inputs.database"
                defaultValue="default"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Database Name"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
            </div>
            <div>
              <Controller
                control={control}
                name="inputs.ca"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isOptional
                    label="CA(SSL)"
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
              <Accordion type="multiple" className="mb-2 mt-4 w-full bg-mineshaft-700">
                <AccordionItem value="advanced">
                  <AccordionTrigger>
                    Creation, Revocation & Renew Statements (optional)
                  </AccordionTrigger>
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
                    <div className="mb-4 text-sm text-mineshaft-300">
                      Customize SQL statements for managing database user lifecycle
                    </div>
                    <Controller
                      control={control}
                      name="inputs.creationStatement"
                      defaultValue={
                        "CREATE USER \"{{username}}\" WITH SUPERUSER ENCRYPTED PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';\nGRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"{{username}}\";"
                      }
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Creation Statement"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                          helperText="username, password and expiration are dynamically provisioned"
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
                      defaultValue={
                        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{{username}}";\nDROP OWNED BY "{{username}}"; DROP ROLE "{{username}}";'
                      }
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Revocation Statement"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                          helperText="username is dynamically provisioned"
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
                      defaultValue={"ALTER ROLE \"{{username}}\" VALID UNTIL '{{expiration}}';"}
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
        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Save
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
