import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Label,
  SheetFooter,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableInput
} from "@app/components/v3";
import { PamResourceType, TMongoDBResource } from "@app/hooks/api/pam";

import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";
import { MetadataFields } from "./MetadataFields";

type Props = {
  resource?: TMongoDBResource;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.MongoDB),
  connectionDetails: z.object({
    connectionString: z
      .string()
      .trim()
      .min(1, "Connection string required")
      .superRefine((val, ctx) => {
        let url: URL;
        try {
          url = new URL(val);
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Invalid MongoDB connection string. Must start with mongodb:// or mongodb+srv://"
          });
          return;
        }

        if (url.protocol !== "mongodb:" && url.protocol !== "mongodb+srv:") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Invalid MongoDB connection string. Must start with mongodb:// or mongodb+srv://"
          });
          return;
        }

        if (url.username || url.password) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Credentials should not be included in the connection string — they are managed separately per account"
          });
          return;
        }

        if (url.pathname && url.pathname !== "/") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Database should not be included in the connection string — use the Database field instead"
          });
        }
      }),
    database: z.string().trim().min(1, "Database required").default("admin"),
    sslEnabled: z.boolean().default(true),
    sslRejectUnauthorized: z.boolean().default(true),
    sslCertificate: z
      .string()
      .trim()
      .transform((value) => value || undefined)
      .optional()
  })
});

type FormData = z.infer<typeof formSchema>;

export const MongoDBResourceForm = ({ resource, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(resource);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource
      ? {
          ...resource,
          gateway: resource.gatewayId ? { id: resource.gatewayId, name: "" } : undefined,
          connectionDetails: resource.connectionDetails
        }
      : {
          resourceType: PamResourceType.MongoDB,
          gateway: undefined,
          connectionDetails: {
            connectionString: "",
            database: "admin",
            sslEnabled: true,
            sslRejectUnauthorized: true,
            sslCertificate: undefined
          }
        }
  });

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  const sslEnabled = watch("connectionDetails.sslEnabled");

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit((data) => onSubmit(data as FormData))}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          <GenericResourceFields />

          {/* Connection */}
          <div className="flex flex-col gap-3">
            <Label>Connection</Label>

            <Controller
              name="connectionDetails.connectionString"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    Connection String
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Supports mongodb:// and mongodb+srv:// URIs. Do not include credentials or
                        database in the URI.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      placeholder="mongodb+srv://cluster0.abc.mongodb.net"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              name="connectionDetails.database"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Database Name</FieldLabel>
                  <FieldContent>
                    <UnstableInput {...field} isError={Boolean(error)} />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          </div>

          {/* SSL */}
          <div className="flex flex-col gap-3">
            <Label>SSL</Label>

            <Controller
              name="connectionDetails.sslEnabled"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldLabel>Enable SSL</FieldLabel>
                  <Switch variant="project" checked={value} onCheckedChange={onChange} />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            <Controller
              name="connectionDetails.sslCertificate"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>CA Certificate</FieldLabel>
                  <FieldContent>
                    <TextArea
                      {...field}
                      placeholder="-----BEGIN CERTIFICATE-----..."
                      disabled={!sslEnabled}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              name="connectionDetails.sslRejectUnauthorized"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldLabel>
                    Reject Unauthorized
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        If enabled, Infisical will only connect to the server if it has a valid,
                        trusted SSL certificate.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Switch
                    variant="project"
                    disabled={!sslEnabled}
                    checked={sslEnabled ? value : false}
                    onCheckedChange={onChange}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </div>

          <MetadataFields />
        </div>
        <SheetFooter className="shrink-0 border-t">
          <Button
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
            variant="neutral"
            type="submit"
          >
            {isUpdate ? "Update Details" : "Create Resource"}
          </Button>
          <Button onClick={closeSheet} variant="outline" className="mr-auto" type="button">
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
