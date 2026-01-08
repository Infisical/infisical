import { useState } from "react";
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
  FilterableSelect,
  FormControl,
  Input,
  SecretInput,
  Select,
  SelectItem,
  Switch,
  TextArea,
  Tooltip
} from "@app/components/v2";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { gatewaysQueryKeys, useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders, SqlProviders } from "@app/hooks/api/dynamicSecret/types";
import { VaultDatabaseRole } from "@app/hooks/api/migration/types";
import { ProjectEnv } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

import { MetadataForm } from "../../DynamicSecretListView/MetadataForm";
import { LoadFromVaultBanner } from "./components/LoadFromVaultBanner";
import { VaultSqlDatabaseImportModal } from "./VaultSqlDatabaseImportModal";

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
  provider: z.object({
    client: z.nativeEnum(SqlProviders),
    host: z.string().toLowerCase().min(1),
    port: z.coerce.number(),
    database: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    passwordRequirements: passwordRequirementsSchema.optional(),
    creationStatement: z.string().min(1),
    revocationStatement: z.string().min(1),
    renewStatement: z.string().optional(),
    sslEnabled: z.boolean().optional(),
    ca: z.string().optional(),
    gatewayId: z.string().optional()
  }),
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
  name: slugSchema(),
  environment: z.object({ name: z.string(), slug: z.string() }),
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
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environments: ProjectEnv[];
  isSingleEnvironmentMode?: boolean;
};

const getSqlStatements = (provider: SqlProviders) => {
  if (provider === SqlProviders.MySql) {
    return {
      creationStatement:
        "CREATE USER \"{{username}}\"@'%' IDENTIFIED BY '{{password}}';\nGRANT ALL ON \"{{database}}\".* TO \"{{username}}\"@'%';",
      renewStatement: "",
      revocationStatement:
        'REVOKE ALL PRIVILEGES ON "{{database}}".* FROM "{{username}}"@\'%\';\nDROP USER "{{username}}"@\'%\';'
    };
  }

  if (provider === SqlProviders.Oracle) {
    return {
      creationStatement:
        'CREATE USER "{{username}}" IDENTIFIED BY "{{password}}";\nGRANT CONNECT TO "{{username}}";\nGRANT CREATE SESSION TO "{{username}}";',
      renewStatement: "",
      revocationStatement:
        'REVOKE CONNECT FROM "{{username}}";\nREVOKE CREATE SESSION FROM "{{username}}";\nDROP USER "{{username}}";'
    };
  }
  if (provider === SqlProviders.MsSQL) {
    return {
      creationStatement:
        "CREATE LOGIN [{{username}}] WITH PASSWORD =  '{{password}}';\nCREATE USER [{{username}}] FOR LOGIN [{{username}}];\nGRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [{{username}}];",
      renewStatement: "",
      revocationStatement: "DROP USER [{{username}}];\nDROP LOGIN [{{username}}];"
    };
  }

  return {
    creationStatement:
      "CREATE USER \"{{username}}\" WITH ENCRYPTED PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';\nGRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"{{username}}\";",
    renewStatement: "ALTER ROLE \"{{username}}\" VALID UNTIL '{{expiration}}';",
    revocationStatement:
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{{username}}";\nDROP ROLE "{{username}}";'
  };
};

const getDefaultPort = (provider: SqlProviders) => {
  switch (provider) {
    case SqlProviders.MySql:
      return 3306;
    case SqlProviders.Oracle:
      return 1521;
    case SqlProviders.MsSQL:
      return 1433;
    default:
      return 5432;
  }
};

export const SqlDatabaseInputForm = ({
  onCompleted,
  onCancel,
  environments,
  secretPath,
  projectSlug,
  isSingleEnvironmentMode
}: Props) => {
  const [isVaultImportModalOpen, setIsVaultImportModalOpen] = useState(false);

  const {
    control,
    setValue,
    formState: { isSubmitting },
    handleSubmit,
    watch
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: {
        ...getSqlStatements(SqlProviders.Postgres),
        passwordRequirements: {
          length: 48,
          required: {
            lowercase: 1,
            uppercase: 1,
            digits: 1,
            symbols: 0
          },
          allowedSymbols: "-_.~!*"
        }
      },
      environment: isSingleEnvironmentMode ? environments[0] : undefined,
      usernameTemplate: "{{randomUsername}}"
    }
  });

  const createDynamicSecret = useCreateDynamicSecret();
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());
  const selectedClient = watch("provider.client");

  const handleCreateDynamicSecret = async ({
    name,
    maxTTL,
    provider,
    defaultTTL,
    environment,
    metadata,
    usernameTemplate
  }: TForm) => {
    // wait till previous request is finished
    if (createDynamicSecret.isPending) return;

    const isDefaultUsernameTemplate = usernameTemplate === "{{randomUsername}}";
    await createDynamicSecret.mutateAsync({
      provider: { type: DynamicSecretProviders.SqlDatabase, inputs: provider },
      maxTTL,
      name,
      path: secretPath,
      defaultTTL,
      projectSlug,
      environmentSlug: environment.slug,
      metadata,
      usernameTemplate:
        !usernameTemplate || isDefaultUsernameTemplate ? undefined : usernameTemplate
    });
    onCompleted();
  };

  const handleDatabaseChange = (type: SqlProviders) => {
    const sqlStatment = getSqlStatements(type);
    setValue("provider.creationStatement", sqlStatment.creationStatement);
    setValue("provider.renewStatement", sqlStatment.renewStatement);
    setValue("provider.revocationStatement", sqlStatment.revocationStatement);
    setValue("provider.port", getDefaultPort(type));

    // Update password requirements based on provider
    const length = type === SqlProviders.Oracle ? 30 : 48;
    setValue("provider.passwordRequirements.length", length);
  };

  const handleVaultImport = (role: VaultDatabaseRole) => {
    try {
      setValue("name", role.name);

      // Determine the SQL provider from the plugin name
      const pluginName = role.config.plugin_name?.toLowerCase() || "";
      let sqlProvider = SqlProviders.Postgres;
      if (pluginName.includes("mysql")) {
        sqlProvider = SqlProviders.MySql;
      } else if (pluginName.includes("oracle")) {
        sqlProvider = SqlProviders.Oracle;
      } else if (pluginName.includes("mssql")) {
        sqlProvider = SqlProviders.MsSQL;
      }
      setValue("provider.client", sqlProvider);

      // Parse connection URL to extract host, port, database
      const connectionUrl = role.config.connection_details.connection_url || "";
      try {
        const trimmedUrl = connectionUrl.trim();
        if (!trimmedUrl) throw new Error("Empty URL");

        const defaultPort = getDefaultPort(sqlProvider);

        const setConnectionDetails = (host: string, port: number | undefined, database: string) => {
          if (host) setValue("provider.host", host);
          const parsedPort = port ?? defaultPort;
          setValue("provider.port", Number.isNaN(parsedPort) ? defaultPort : parsedPort);
          if (database) setValue("provider.database", database);
        };

        const parseStandardUrl = (url: URL, dbFromParams?: string) => {
          const port = url.port ? parseInt(url.port, 10) : undefined;
          const database = dbFromParams || url.pathname.replace(/^\//, "");
          setConnectionDetails(url.hostname, port, database);
        };

        if (sqlProvider === SqlProviders.MySql) {
          // MySQL format: user:pass@tcp(host:port)/database or standard URL
          const tcpMatch = trimmedUrl.match(/@tcp\(([^:]+):?(\d+)?\)\/([^?#]+)/);
          if (tcpMatch) {
            const port = tcpMatch[2] ? parseInt(tcpMatch[2], 10) : undefined;
            setConnectionDetails(tcpMatch[1], port, tcpMatch[3]);
          } else if (trimmedUrl.includes("://")) {
            parseStandardUrl(new URL(trimmedUrl));
          }
        } else if (sqlProvider === SqlProviders.Oracle) {
          // Oracle format: user/pass@host:port/service_name or user/pass@//host:port/service_name
          const oracleMatch = trimmedUrl.match(/@(?:\/\/)?([^:/]+):?(\d+)?\/(.+)/);
          if (oracleMatch) {
            const port = oracleMatch[2] ? parseInt(oracleMatch[2], 10) : undefined;
            setConnectionDetails(oracleMatch[1], port, oracleMatch[3]);
          }
        } else if (sqlProvider === SqlProviders.MsSQL) {
          // MSSQL format: sqlserver://user:pass@host:port?database=name
          const url = new URL(trimmedUrl);
          const dbParam =
            url.searchParams.get("database") || url.searchParams.get("databaseName") || "";
          parseStandardUrl(url, dbParam);
        } else {
          // PostgreSQL format: postgresql://user:pass@host:port/database
          parseStandardUrl(new URL(trimmedUrl));
        }
      } catch {
        // Connection URL parsing failed, user will need to fill in manually
      }

      if (role.config.connection_details.username) {
        setValue("provider.username", role.config.connection_details.username);
      }

      if (role.config.connection_details.tls_ca) {
        setValue("provider.ca", role.config.connection_details.tls_ca);
      }

      // Convert {{name}} variable to {{username}}
      const convertVaultVariables = (statement: string) =>
        statement.replace(/\{\{name\}\}/g, "{{username}}");

      // Set statements
      if (role.creation_statements && role.creation_statements.length > 0) {
        setValue(
          "provider.creationStatement",
          role.creation_statements.map(convertVaultVariables).join("\n")
        );
      }

      if (role.revocation_statements && role.revocation_statements.length > 0) {
        setValue(
          "provider.revocationStatement",
          role.revocation_statements.map(convertVaultVariables).join("\n")
        );
      }

      if (role.renew_statements && role.renew_statements.length > 0) {
        setValue(
          "provider.renewStatement",
          role.renew_statements.map(convertVaultVariables).join("\n")
        );
      }

      // Set TTLs
      if (role.default_ttl) {
        const defaultTTL = `${role.default_ttl}s`;
        setValue("defaultTTL", defaultTTL);
      }

      if (role.max_ttl) {
        const maxTTL = `${role.max_ttl}s`;
        setValue("maxTTL", maxTTL);
      }

      createNotification({
        type: "info",
        text: "Configuration loaded successfully from HashiCorp Vault"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to load configuration from HashiCorp Vault"
      });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleCreateDynamicSecret)} autoComplete="off">
        <div>
          <LoadFromVaultBanner onClick={() => setIsVaultImportModalOpen(true)} />
          <div className="flex items-center space-x-2">
            <div className="grow">
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
                    name="provider.gatewayId"
                    defaultValue=""
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
              <div className="pb-0.5 pl-1 text-sm text-mineshaft-400">Service</div>
              <Controller
                control={control}
                name="provider.client"
                defaultValue={SqlProviders.Postgres}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                    <Select
                      value={value}
                      onValueChange={(val) => {
                        onChange(val);
                        handleDatabaseChange(val as SqlProviders);
                      }}
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
                  name="provider.host"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Host"
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
                  name="provider.port"
                  defaultValue={5432}
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
                <Controller
                  control={control}
                  name="provider.username"
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
                  name="provider.password"
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
                  name="provider.database"
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
                {selectedClient === SqlProviders.MsSQL && (
                  <div className="mt-2 mb-2">
                    <Controller
                      control={control}
                      name="provider.sslEnabled"
                      render={({ field: { value, onChange }, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                          <Switch
                            className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                            id="sql-ds-ssl-enabled"
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
                )}
                <Controller
                  control={control}
                  name="provider.ca"
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
                <Accordion type="multiple" className="mb-2 w-full bg-mineshaft-700">
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
                              placeholder="{{randomUsername}}"
                            />
                          </FormControl>
                        )}
                      />
                      <div className="mb-4 text-sm text-mineshaft-300">
                        Customize SQL statements for managing database user lifecycle
                      </div>
                      <Controller
                        control={control}
                        name="provider.creationStatement"
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
                        name="provider.revocationStatement"
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
                        name="provider.renewStatement"
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
                            name="provider.passwordRequirements.length"
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
                                watch("provider.passwordRequirements.required") || {}
                              ).reduce((sum, count) => sum + Number(count || 0), 0);
                              const length = watch("provider.passwordRequirements.length") || 0;
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
                              name="provider.passwordRequirements.required.lowercase"
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
                              name="provider.passwordRequirements.required.uppercase"
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
                              name="provider.passwordRequirements.required.digits"
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
                              name="provider.passwordRequirements.required.symbols"
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
                            name="provider.passwordRequirements.allowedSymbols"
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
      <VaultSqlDatabaseImportModal
        isOpen={isVaultImportModalOpen}
        onOpenChange={setIsVaultImportModalOpen}
        onImport={handleVaultImport}
      />
    </div>
  );
};
