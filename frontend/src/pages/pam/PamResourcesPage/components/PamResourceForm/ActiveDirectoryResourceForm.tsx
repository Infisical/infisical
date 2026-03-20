import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
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
import { PamResourceType, TActiveDirectoryResource } from "@app/hooks/api/pam";

import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";
import { MetadataFields } from "./MetadataFields";

type Props = {
  resource?: TActiveDirectoryResource;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.ActiveDirectory),
  connectionDetails: z.object({
    domain: z.string().trim().min(1, "Domain is required"),
    dcAddress: z.string().trim().min(1, "DC address is required"),
    port: z.coerce.number().int().min(1).max(65535),
    useLdaps: z.boolean().default(false),
    ldapRejectUnauthorized: z.boolean().default(true),
    ldapCaCert: z
      .string()
      .trim()
      .transform((val) => val || undefined)
      .optional(),
    ldapTlsServerName: z
      .string()
      .trim()
      .transform((val) => val || undefined)
      .optional()
  })
});

type FormData = z.infer<typeof formSchema>;

export const ActiveDirectoryResourceForm = ({ resource, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(resource);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource
      ? {
          ...resource,
          gateway: resource.gatewayId ? { id: resource.gatewayId, name: "" } : undefined,
          connectionDetails: {
            ...resource.connectionDetails,
            useLdaps: resource.connectionDetails.useLdaps ?? false,
            ldapRejectUnauthorized: resource.connectionDetails.ldapRejectUnauthorized ?? true,
            ldapCaCert: resource.connectionDetails.ldapCaCert ?? "",
            ldapTlsServerName: resource.connectionDetails.ldapTlsServerName ?? ""
          }
        }
      : {
          resourceType: PamResourceType.ActiveDirectory,
          gateway: undefined,
          connectionDetails: {
            domain: "",
            dcAddress: "",
            port: 389,
            useLdaps: false,
            ldapRejectUnauthorized: true,
            ldapCaCert: "",
            ldapTlsServerName: ""
          }
        }
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  const useLdaps = useWatch({ control, name: "connectionDetails.useLdaps" });
  const ldapRejectUnauthorized = useWatch({
    control,
    name: "connectionDetails.ldapRejectUnauthorized"
  });

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit((data) => onSubmit(data as FormData))}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          <GenericResourceFields />
          <Controller
            name="connectionDetails.domain"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Domain</FieldLabel>
                <FieldContent>
                  <UnstableInput
                    {...field}
                    isError={Boolean(error)}
                    placeholder="corp.example.com"
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <div className="flex items-start gap-2">
            <Controller
              name="connectionDetails.dcAddress"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel>DC Address</FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      isError={Boolean(error)}
                      placeholder="10.0.1.10 or dc.corp.example.com"
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              name="connectionDetails.port"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="w-28">
                  <FieldLabel>Port</FieldLabel>
                  <FieldContent>
                    <UnstableInput type="number" {...field} isError={Boolean(error)} />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          </div>
          <div className="flex flex-col gap-3">
            <Label>LDAP</Label>

            <Controller
              name="connectionDetails.useLdaps"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldLabel>Enable LDAPS</FieldLabel>
                  <Switch
                    variant="project"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            <Controller
              name="connectionDetails.ldapCaCert"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>CA Certificate</FieldLabel>
                  <FieldContent>
                    <TextArea
                      {...field}
                      className="max-h-32"
                      disabled={!useLdaps}
                      placeholder="-----BEGIN CERTIFICATE-----..."
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              name="connectionDetails.ldapRejectUnauthorized"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldLabel>
                    Reject Unauthorized
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        If enabled, Infisical will only connect to the Domain Controller if it has a
                        valid, trusted TLS certificate
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Switch
                    variant="project"
                    disabled={!useLdaps}
                    checked={useLdaps ? field.value : false}
                    onCheckedChange={field.onChange}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            <Controller
              name="connectionDetails.ldapTlsServerName"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    TLS Server Name
                    <Tooltip>
                      <TooltipTrigger>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        The expected hostname in the server's TLS certificate. Required when DC
                        Address is an IP address and Reject Unauthorized is enabled.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      placeholder="dc.corp.example.com"
                      disabled={!useLdaps || !ldapRejectUnauthorized}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
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
