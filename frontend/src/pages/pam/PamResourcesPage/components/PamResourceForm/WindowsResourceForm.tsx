import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormControl, Select, SelectItem } from "@app/components/v2";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  SheetFooter,
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
    port: z.coerce.number().int().min(1).max(65535)
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
          adServerResourceId: resource.adServerResourceId ?? null
        }
      : {
          resourceType: PamResourceType.Windows,
          gateway: undefined,
          connectionDetails: {
            protocol: WindowsProtocol.RDP,
            hostname: "",
            port: 3389
          },
          adServerResourceId: null
        }
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

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
              <FormControl
                isError={Boolean(error?.message)}
                errorText={error?.message}
                label="Active Directory Resource"
                helperText="Optionally associate this server with an AD domain"
              >
                <Select
                  value={value || "none"}
                  onValueChange={(val) => onChange(val === "none" ? null : val)}
                  className="w-full border border-mineshaft-500"
                  dropdownContainerClassName="max-w-none"
                  isLoading={isAdResourcesLoading}
                  placeholder="None"
                  position="popper"
                >
                  <SelectItem value="none" key="none">
                    None
                  </SelectItem>
                  {(adResources?.resources || []).map((adResource) => (
                    <SelectItem value={adResource.id} key={adResource.id}>
                      {adResource.name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
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
