import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, Select, SelectItem } from "@app/components/v2";
import { useProject } from "@app/context";
import { PamResourceType, TWindowsResource, useListPamResources } from "@app/hooks/api/pam";
import { WindowsProtocol } from "@app/hooks/api/pam/types/windows-server-resource";

import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";

type Props = {
  resource?: TWindowsResource;
  onSubmit: (formData: FormData) => Promise<void>;
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

export const WindowsResourceForm = ({ resource, onSubmit }: Props) => {
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
          adServerResourceId: resource.adServerResourceId ?? null
        }
      : {
          resourceType: PamResourceType.Windows,
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
      <form onSubmit={handleSubmit(onSubmit)}>
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
        <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3 pb-0">
          <div className="mt-[0.675rem] flex items-start gap-2">
            <Controller
              name="connectionDetails.hostname"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Hostname"
                >
                  <Input placeholder="example.com or 192.168.1.1" {...field} />
                </FormControl>
              )}
            />
            <Controller
              name="connectionDetails.port"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="w-28"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Port"
                >
                  <Input type="number" {...field} />
                </FormControl>
              )}
            />
          </div>
        </div>
        <div className="mt-6 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Details" : "Create Resource"}
          </Button>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};
