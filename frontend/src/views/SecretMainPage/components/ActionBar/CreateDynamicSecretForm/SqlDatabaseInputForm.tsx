import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { TtlFormLabel } from "@app/components/features";
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
    port: z.number(),
    database: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    creationStatement: z.string().min(1),
    revocationStatement: z.string().min(1),
    renewStatement: z.string().min(1),
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
  slug: z.string().toLowerCase()
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environment: string;
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
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: {
        creationStatement:
          "CREATE USER \"{{username}}\" WITH SUPERUSER ENCRYPTED PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';\nGRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"{{username}}\";",
        renewStatement: "ALTER ROLE \"{{username}}\" VALID UNTIL '{{expiration}}';",
        revocationStatement:
          'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{{username}}";\nDROP OWNED BY "{{username}}";\nDROP ROLE "{{username}}";'
      }
    }
  });
  const { createNotification } = useNotificationContext();
  const createDynamicSecret = useCreateDynamicSecret();

  const handleCreateDynamicSecret = async ({ slug, maxTTL, provider, defaultTTL }: TForm) => {
    // wait till previous request is finished
    if (createDynamicSecret.isLoading) return;
    try {
      await createDynamicSecret.mutateAsync({
        provider: { type: DynamicSecretProviders.SqlDatabase, inputs: provider },
        maxTTL,
        slug,
        path: secretPath,
        defaultTTL,
        projectSlug,
        environment
      });
      onCompleted();
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to create dynamic secret"
      });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleCreateDynamicSecret)}>
        <div className="flex items-center space-x-2">
          <div className="flex-grow">
            <Controller
              control={control}
              defaultValue=""
              name="slug"
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
          <div className="mb-4 border-b border-b-mineshaft-600 pb-2">Configuration</div>
          <div className="flex flex-col">
            <Controller
              control={control}
              name="provider.client"
              defaultValue={SqlProviders.Postgres}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
                  <Select
                    value={value}
                    onValueChange={(val) => onChange(val)}
                    className="w-full border border-mineshaft-500"
                  >
                    <SelectItem value={SqlProviders.Postgres}>PostgreSQL</SelectItem>
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
                    <Input {...field} />
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
                    <Input {...field} type="password" />
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
              <Accordion
                type="single"
                collapsible
                className="w-full bg-mineshaft-700"
              >
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
