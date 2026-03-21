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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableInput
} from "@app/components/v3";
import { useProject } from "@app/context";
import { PamResourceType, TWindowsResource, useListPamResources } from "@app/hooks/api/pam";
import { WindowsProtocol } from "@app/hooks/api/pam/types/windows-server-resource";

import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";
import { MetadataFields } from "./MetadataFields";

type Props = {
  resource?: TWindowsResource;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.Windows),
  connectionDetails: z.object({
    protocol: z.literal(WindowsProtocol.RDP),
    hostname: z.string().trim().min(1, "Hostname is required"),
    port: z.coerce.number().int().min(1).max(65535),
    winrmPort: z.coerce.number().int().min(1).max(65535),
    useWinrmHttps: z.boolean(),
    winrmRejectUnauthorized: z.boolean(),
    winrmCaCert: z
      .string()
      .trim()
      .transform((val) => val || undefined)
      .optional(),
    winrmTlsServerName: z
      .string()
      .trim()
      .transform((val) => val || undefined)
      .optional()
  }),
  adServerResourceId: z.string().uuid().nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

export const WindowsResourceForm = ({ resource, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(resource);
  const { projectId } = useProject();

  const { data: adResources, isPending: isAdResourcesLoading } = useListPamResources({
    projectId,
    filterResourceTypes: PamResourceType.ActiveDirectory
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource
      ? {
          ...resource,
          gateway: resource.gatewayId ? { id: resource.gatewayId, name: "" } : undefined,
          adServerResourceId: resource.adServerResourceId ?? null,
          connectionDetails: {
            ...(resource.connectionDetails as FormData["connectionDetails"]),
            winrmPort: (resource.connectionDetails as any).winrmPort ?? 5986,
            useWinrmHttps: (resource.connectionDetails as any).useWinrmHttps ?? true,
            winrmRejectUnauthorized:
              (resource.connectionDetails as any).winrmRejectUnauthorized ?? true,
            winrmCaCert: (resource.connectionDetails as any).winrmCaCert ?? "",
            winrmTlsServerName: (resource.connectionDetails as any).winrmTlsServerName ?? ""
          }
        }
      : {
          resourceType: PamResourceType.Windows,
          gateway: undefined,
          connectionDetails: {
            protocol: WindowsProtocol.RDP,
            hostname: "",
            port: 3389,
            winrmPort: 5986,
            useWinrmHttps: true,
            winrmRejectUnauthorized: true,
            winrmCaCert: "",
            winrmTlsServerName: ""
          },
          adServerResourceId: null
        }
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  const useWinrmHttps = useWatch({ control, name: "connectionDetails.useWinrmHttps" });
  const winrmRejectUnauthorized = useWatch({
    control,
    name: "connectionDetails.winrmRejectUnauthorized"
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
            control={control}
            name="adServerResourceId"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Active Directory Resource</FieldLabel>
                <FieldContent>
                  <Select
                    value={value || "none"}
                    onValueChange={(val) => onChange(val === "none" ? null : val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isAdResourcesLoading ? "Loading..." : "None"} />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      <SelectItem value="none">None</SelectItem>
                      {(adResources?.resources || []).map((adResource) => (
                        <SelectItem value={adResource.id} key={adResource.id}>
                          {adResource.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted">
                    Optionally associate this server with an AD domain
                  </p>
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />

          {/* RDP Connection */}
          <div className="flex items-start gap-2">
            <Controller
              name="connectionDetails.hostname"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel>Hostname</FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      isError={Boolean(error)}
                      placeholder="example.com or 192.168.1.1"
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

          {/* WinRM Configuration */}
          <div className="flex flex-col gap-3">
            <Label>WinRM</Label>

            <Controller
              name="connectionDetails.winrmPort"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    Port
                    <Tooltip>
                      <TooltipTrigger>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        The WinRM port on this machine. Default is 5985 for HTTP or 5986 for HTTPS
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      type="number"
                      placeholder="5986"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              name="connectionDetails.useWinrmHttps"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldLabel>Enable HTTPS</FieldLabel>
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
              name="connectionDetails.winrmCaCert"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>CA Certificate</FieldLabel>
                  <FieldContent>
                    <TextArea
                      {...field}
                      className="max-h-32"
                      disabled={!useWinrmHttps}
                      placeholder="-----BEGIN CERTIFICATE-----..."
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              name="connectionDetails.winrmRejectUnauthorized"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldLabel>
                    Reject Unauthorized
                    <Tooltip>
                      <TooltipTrigger>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        If enabled, Infisical will only connect if the machine has a valid, trusted
                        TLS certificate
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Switch
                    variant="project"
                    disabled={!useWinrmHttps}
                    checked={useWinrmHttps ? field.value : false}
                    onCheckedChange={field.onChange}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            <Controller
              name="connectionDetails.winrmTlsServerName"
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
                        The expected hostname in the server&apos;s TLS certificate. Required when
                        connecting via IP address and Reject Unauthorized is enabled.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      placeholder="server.corp.example.com"
                      disabled={!useWinrmHttps || !winrmRejectUnauthorized}
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
