import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
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
  TextArea
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { VaultDatabaseRole } from "@app/hooks/api/migration/types";
import { ProjectEnv } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

import { LoadFromVaultBanner } from "./components/LoadFromVaultBanner";
import { VaultCassandraImportModal } from "./VaultCassandraImportModal";

const formSchema = z.object({
  provider: z.object({
    host: z.string().toLowerCase().min(1),
    port: z.coerce.number(),
    keyspace: z.string().optional(),
    localDataCenter: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    creationStatement: z.string().min(1),
    revocationStatement: z.string().min(1),
    renewStatement: z.string().optional(),
    ca: z.string().optional()
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

const getSqlStatements = () => {
  return {
    creationStatement:
      "CREATE ROLE '{{username}}' WITH PASSWORD = '{{password}}' AND LOGIN=true;\nGRANT ALL PERMISSIONS ON ALL KEYSPACES TO '{{username}}';",
    renewStatement: "",
    revocationStatement: 'DROP ROLE "{{username}}";'
  };
};

export const CassandraInputForm = ({
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
    formState: { isSubmitting },
    handleSubmit,
    setValue
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: getSqlStatements(),
      environment: isSingleEnvironmentMode ? environments[0] : undefined,
      usernameTemplate: "{{randomUsername}}"
    }
  });

  const createDynamicSecret = useCreateDynamicSecret();

  const handleVaultImport = (role: VaultDatabaseRole) => {
    try {
      setValue("name", role.name);

      // Parse hosts field or connection_url
      const hostsField = role.config.connection_details.hosts || "";
      const connectionUrl = role.config.connection_details.connection_url || "";
      const connectionString = hostsField || connectionUrl;

      try {
        const trimmedUrl = connectionString.trim();
        if (trimmedUrl) {
          // Try to extract host and port from various formats
          const parts = trimmedUrl.split(",");
          const hosts: string[] = [];
          let port = 9042; // Default Cassandra port

          parts.forEach((part) => {
            const hostPort = part.trim().split(":");
            hosts.push(hostPort[0]);
            if (hostPort[1]) {
              port = parseInt(hostPort[1], 10);
            }
          });

          if (hosts.length > 0) {
            setValue("provider.host", hosts.join(","));
          }
          if (!Number.isNaN(port)) {
            setValue("provider.port", port);
          }
        }
      } catch {
        // Connection string parsing failed, user will need to fill in manually
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

  const handleCreateDynamicSecret = async ({
    name,
    maxTTL,
    provider,
    defaultTTL,
    environment,
    usernameTemplate
  }: TForm) => {
    // wait till previous request is finished
    if (createDynamicSecret.isPending) return;

    const isDefaultUsernameTemplate = usernameTemplate === "{{randomUsername}}";
    await createDynamicSecret.mutateAsync({
      provider: { type: DynamicSecretProviders.Cassandra, inputs: provider },
      maxTTL,
      name,
      path: secretPath,
      defaultTTL,
      projectSlug,
      environmentSlug: environment.slug,
      usernameTemplate:
        !usernameTemplate || isDefaultUsernameTemplate ? undefined : usernameTemplate
    });
    onCompleted();
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
                    <Input {...field} placeholder="dynamic-postgres" />
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
            <div className="mt-4 mb-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Configuration
            </div>
            <div className="flex flex-col">
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
                      <Input {...field} placeholder="host1,host2" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="provider.port"
                  defaultValue={9042}
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
              <Controller
                control={control}
                name="provider.localDataCenter"
                defaultValue="datacenter1"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Local Data Center"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
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
                  name="provider.keyspace"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Keyspace"
                      isError={Boolean(error?.message)}
                      isOptional
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
                  name="provider.ca"
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
                <Accordion type="single" collapsible className="mb-2 w-full bg-mineshaft-700">
                  <AccordionItem value="advance-statements">
                    <AccordionTrigger>Modify CQL Statements</AccordionTrigger>
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
                      <Controller
                        control={control}
                        name="provider.creationStatement"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            label="Creation Statement"
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            helperText="variables: keyspace. username, password and expiration are dynamically provisioned"
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
                            helperText="variables: keyspace, username is dynamically provisioned"
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
                            helperText="variables: keyspace, username and expiration are dynamically provisioned"
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
        <VaultCassandraImportModal
          isOpen={isVaultImportModalOpen}
          onOpenChange={setIsVaultImportModalOpen}
          onImport={handleVaultImport}
        />
      </form>
    </div>
  );
};
