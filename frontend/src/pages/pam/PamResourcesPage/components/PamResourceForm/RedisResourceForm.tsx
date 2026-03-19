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
import { PamResourceType, TRedisResource } from "@app/hooks/api/pam";

import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";
import { MetadataFields } from "./MetadataFields";

type Props = {
  resource?: TRedisResource;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.Redis),
  connectionDetails: z.object({
    host: z.string().trim().min(1, "Host is required"),
    port: z.coerce.number().int().min(1).max(65535),
    sslEnabled: z.boolean().default(true),
    sslRejectUnauthorized: z.boolean().default(true),
    sslCertificate: z.string().trim().optional()
  })
});

type FormData = z.infer<typeof formSchema>;

export const RedisResourceForm = ({ resource, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(resource);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource
      ? {
          ...resource,
          gateway: resource.gatewayId ? { id: resource.gatewayId, name: "" } : undefined
        }
      : {
          resourceType: PamResourceType.Redis,
          gateway: undefined,
          connectionDetails: {
            host: "",
            port: 6379,
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

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Controller
                name="connectionDetails.host"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Host</FieldLabel>
                    <FieldContent>
                      <UnstableInput {...field} isError={Boolean(error)} />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                name="connectionDetails.port"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="w-24">
                    <FieldLabel>Port</FieldLabel>
                    <FieldContent>
                      <UnstableInput type="number" {...field} isError={Boolean(error)} />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </div>
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
                      <TooltipTrigger>
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
