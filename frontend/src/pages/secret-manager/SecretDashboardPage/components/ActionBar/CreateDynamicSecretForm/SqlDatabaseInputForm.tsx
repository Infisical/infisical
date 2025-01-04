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
  FormControl,
  Input,
  SecretInput,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders, SqlProviders } from "@app/hooks/api/dynamicSecret/types";

const formSchema = z.object({
  provider: z.object({
    client: z.nativeEnum(SqlProviders),
    host: z.string().toLowerCase().min(1),
    port: z.coerce.number(),
    database: z.string().min(1),
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
    }),
  name: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase")
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environment: string;
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
  environment,
  secretPath,
  projectSlug
}: Props) => {
  const {
    control,
    setValue,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: getSqlStatements(SqlProviders.Postgres)
    }
  });

  const createDynamicSecret = useCreateDynamicSecret();

  const handleCreateDynamicSecret = async ({ name, maxTTL, provider, defaultTTL }: TForm) => {
    // wait till previous request is finished
    if (createDynamicSecret.isPending) return;
    try {
      await createDynamicSecret.mutateAsync({
        provider: { type: DynamicSecretProviders.SqlDatabase, inputs: provider },
        maxTTL,
        name,
        path: secretPath,
        defaultTTL,
        projectSlug,
        environmentSlug: environment
      });
      onCompleted();
    } catch {
      createNotification({
        type: "error",
        text: "Failed to create dynamic secret"
      });
    }
  };

  const handleDatabaseChange = (type: SqlProviders) => {
    const sqlStatment = getSqlStatements(type);
    setValue("provider.creationStatement", sqlStatment.creationStatement);
    setValue("provider.renewStatement", sqlStatment.renewStatement);
    setValue("provider.revocationStatement", sqlStatment.revocationStatement);
    setValue("provider.port", getDefaultPort(type));
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
                    <AccordionTrigger>Modify SQL Statements</AccordionTrigger>
                    <AccordionContent>
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
    </div>
  );
};
