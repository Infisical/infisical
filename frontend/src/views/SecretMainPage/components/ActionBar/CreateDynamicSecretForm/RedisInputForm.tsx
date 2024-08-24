import { useEffect } from "react";
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
import { DynamicSecretProviders, RedisProviders } from "@app/hooks/api/dynamicSecret/types";

const formSchema = z.object({
  provider: z
    .object({
      client: z.nativeEnum(RedisProviders),
      host: z.string().toLowerCase().min(1),
      port: z.coerce.number(),
      username: z.string().min(1), // In case of Elasticache, this is accessKeyId
      password: z.string().min(1).optional(), // In case of Elasticache, this is secretAccessKey

      elastiCacheIamUsername: z.string().trim().optional(),
      elastiCacheRegion: z.string().trim().optional(),

      creationStatement: z.string().min(1),
      renewStatement: z.string().optional(),
      revocationStatement: z.string().min(1),
      ca: z.string().optional()
    })
    .refine(
      (data) => {
        if (data.client === RedisProviders.Elasticache) {
          return !!data.elastiCacheIamUsername;
        }
        return true;
      },
      {
        message: "elastiCacheIamUsername is required when client is ElastiCache",
        path: ["elastiCacheIamUsername"]
      }
    )
    .refine(
      (data) => {
        if (data.client === RedisProviders.Elasticache) {
          return !!data.elastiCacheRegion;
        }
        return true;
      },
      {
        message: "AWS region is required when using ElastiCache",
        path: ["elastiCacheRegion"]
      }
    ),
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

export const RedisInputForm = ({
  onCompleted,
  onCancel,
  environment,
  secretPath,
  projectSlug
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    setValue,
    watch
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: {
        client: RedisProviders.Redis,
        username: "default"
      }
    }
  });

  const createDynamicSecret = useCreateDynamicSecret();

  const handleCreateDynamicSecret = async ({ name, maxTTL, provider, defaultTTL }: TForm) => {
    // wait till previous request is finished
    if (createDynamicSecret.isLoading) return;
    try {
      await createDynamicSecret.mutateAsync({
        provider: { type: DynamicSecretProviders.Redis, inputs: provider },
        maxTTL,
        name,
        path: secretPath,
        defaultTTL,
        projectSlug,
        environmentSlug: environment
      });
      onCompleted();
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to create dynamic secret"
      });
    }
  };

  const getRedisStatements = (type: RedisProviders) => {
    const defaultRedisStatements = {
      creationStatement: "ACL SETUSER {{username}} on >{{password}} ~* &* +@all",
      revocationStatement: "ACL DELUSER {{username}}",
      renewStatement: ""
    };

    if (type === RedisProviders.Redis) {
      return defaultRedisStatements;
    }
    if (type === RedisProviders.Elasticache) {
      return {
        creationStatement: `{
        "UserId": "{{username}}",
        "UserName": "{{username}}",
        "Engine": "redis",
        "Passwords": ["{{password}}"],
        "AccessString": "on ~* +@all"
}`,
        revocationStatement: `{
        "UserId": "{{username}}"
}`,
        renewStatement: ""
      };
    }

    return defaultRedisStatements;
  };

  const selectedProvider = watch("provider.client");

  const handleDatabaseChange = (type: RedisProviders) => {
    const redisStatement = getRedisStatements(type);
    setValue("provider.creationStatement", redisStatement.creationStatement);
    setValue("provider.renewStatement", redisStatement.renewStatement);
    setValue("provider.revocationStatement", redisStatement.revocationStatement);

    if (type === RedisProviders.Elasticache) {
      setValue("provider.username", "");
    }
  };

  useEffect(() => {
    handleDatabaseChange(selectedProvider);
  }, []);

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
              <div className="flex w-full items-center gap-2">
                <Controller
                  control={control}
                  name="provider.client"
                  defaultValue={RedisProviders.Redis}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      label="Service"
                      className="w-full"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Select
                        value={value}
                        onValueChange={(val) => {
                          onChange(val);
                          handleDatabaseChange(val as RedisProviders);
                        }}
                        className="w-full border border-mineshaft-500"
                      >
                        <SelectItem value={RedisProviders.Redis}>Redis</SelectItem>
                        <SelectItem value={RedisProviders.Elasticache}>AWS ElastiCache</SelectItem>
                      </Select>
                    </FormControl>
                  )}
                />
                {selectedProvider === RedisProviders.Elasticache && (
                  <Controller
                    control={control}
                    name="provider.elastiCacheRegion"
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label="AWS Region"
                        className="w-full"
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                      >
                        <Input {...field} placeholder="us-east-1" />
                      </FormControl>
                    )}
                  />
                )}
              </div>
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
                defaultValue={6379}
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
            {selectedProvider === RedisProviders.Elasticache && (
              <div className="flex w-full">
                <Controller
                  control={control}
                  name="provider.elastiCacheIamUsername"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Redis Username"
                      className="w-full"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} autoComplete="off" />
                    </FormControl>
                  )}
                />
              </div>
            )}
            <div className="flex space-x-2">
              <Controller
                control={control}
                name="provider.username"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label={
                      selectedProvider === RedisProviders.Elasticache ? "Access Key ID" : "Username"
                    }
                    className="w-full"
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
                    className="w-full"
                    tooltipText={
                      selectedProvider === RedisProviders.Redis
                        ? "Required if your Redis server is password protected."
                        : undefined
                    }
                    label={
                      selectedProvider === RedisProviders.Elasticache
                        ? "Secret Access Key"
                        : "Username"
                    }
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} type="password" autoComplete="new-password" />
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
                  <AccordionTrigger>Modify Redis Statements</AccordionTrigger>
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
