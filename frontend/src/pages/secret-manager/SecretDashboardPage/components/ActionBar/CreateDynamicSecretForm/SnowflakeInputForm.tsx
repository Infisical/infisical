import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  TextArea
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { WorkspaceEnv } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  provider: z.object({
    accountId: z.string().trim().min(1),
    orgId: z.string().trim().min(1),
    username: z.string().trim().min(1),
    password: z.string().trim().min(1),
    creationStatement: z.string().trim().min(1),
    revocationStatement: z.string().trim().min(1),
    renewStatement: z.string().trim().optional()
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
  environments: WorkspaceEnv[];
  isSingleEnvironmentMode?: boolean;
};

export const SnowflakeInputForm = ({
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
      provider: {
        creationStatement:
          "CREATE USER {{username}} PASSWORD = '{{password}}' DEFAULT_ROLE = public DEFAULT_SECONDARY_ROLES = ('ALL') MUST_CHANGE_PASSWORD = FALSE DAYS_TO_EXPIRY = {{expiration}};",
        revocationStatement: "DROP USER {{username}};",
        renewStatement: "ALTER USER {{username}} SET DAYS_TO_EXPIRY = {{expiration}};"
      },
      environment: isSingleEnvironmentMode ? environments[0] : undefined,
      usernameTemplate: "{{randomUsername}}"
    }
  });

  const createDynamicSecret = useCreateDynamicSecret();

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
    try {
      const isDefaultUsernameTemplate = usernameTemplate === "{{randomUsername}}";
      await createDynamicSecret.mutateAsync({
        provider: { type: DynamicSecretProviders.Snowflake, inputs: provider },
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
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create dynamic secret"
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
              <a
                href="https://infisical.com/docs/documentation/platform/dynamic-secrets/snowflake"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="mb-1 ml-2 inline-block rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.07rem] ml-1.5 text-xxs"
                  />
                </div>
              </a>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <Controller
                  control={control}
                  name="provider.accountId"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Account Identifier"
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
                  name="provider.orgId"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Organization Identifier"
                      className="flex-grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} />
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
                      className="flex-grow"
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
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Password"
                      className="flex-grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} type="password" autoComplete="new-password" />
                    </FormControl>
                  )}
                />
              </div>
              <Accordion type="single" collapsible className="mb-2 w-full bg-mineshaft-700">
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
