import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useConnectionCreation } from "@app/components/app-connections/useConnectionCreation";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  DialogBody,
  DialogClose,
  DialogFooter,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  CaSigningConfigType,
  useCreateCaSigningConfig,
  useGetCaSigningConfig,
  useInstallCaCertificateAdcsNative,
  useUpdateCaSigningConfig
} from "@app/hooks/api";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { useAdcsConnectionListCertificateTemplates } from "@app/hooks/api/appConnections/adcs";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  appConnectionId: z.string().min(1, "App connection is required"),
  template: z.string().min(1, "Certificate template is required"),
  maxPathLength: z.string()
});

type FormData = z.infer<typeof schema>;

type Props = {
  caId: string;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["installCaCert"]>, state?: boolean) => void;
};

export const AdcsNativeCaInstallForm = ({ caId, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();

  const { data: availableAdcsConnections, isPending: isAdcsPending } =
    useListAvailableAppConnections(AppConnection.ADCS, currentProject.id);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      maxPathLength: "-1"
    }
  });

  const connectionCreation = useConnectionCreation(AppConnection.ADCS, (connection) => {
    setValue("appConnectionId", connection.id, { shouldValidate: true });
  });

  const selectedConnectionId = watch("appConnectionId");

  const { data: templates = [], isPending: isTemplatesLoading } =
    useAdcsConnectionListCertificateTemplates(selectedConnectionId ?? "", {
      enabled: !!selectedConnectionId
    });

  const { data: existingSigningConfig } = useGetCaSigningConfig(caId, { enabled: !!caId });
  const { mutateAsync: createSigningConfig } = useCreateCaSigningConfig();
  const { mutateAsync: updateSigningConfig } = useUpdateCaSigningConfig();
  const { mutateAsync: installAdcsNativeCert } = useInstallCaCertificateAdcsNative();

  const onFormSubmit = async ({ appConnectionId, template, maxPathLength }: FormData) => {
    if (!caId) return;

    try {
      const destinationConfig = { template };

      if (existingSigningConfig?.type === CaSigningConfigType.ADCS) {
        await updateSigningConfig({
          caId,
          appConnectionId,
          destinationConfig
        });
      } else {
        await createSigningConfig({
          caId,
          type: CaSigningConfigType.ADCS,
          appConnectionId,
          destinationConfig
        });
      }

      await installAdcsNativeCert({
        caId,
        maxPathLength: Number(maxPathLength)
      });

      reset();
      handlePopUpToggle("installCaCert", false);
      createNotification({
        text: "Certificate installation has been queued",
        type: "success"
      });
    } catch (err) {
      createNotification({
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Failed to install certificate via ADCS",
        type: "error"
      });
    }
  };

  return (
    <form className="contents" onSubmit={handleSubmit(onFormSubmit)}>
      <DialogBody>
        <Controller
          control={control}
          name="appConnectionId"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Microsoft ADCS Connection <span className="text-danger">*</span>
              </FieldLabel>
              <Combobox
                isError={Boolean(error)}
                modal
                isClearable={false}
                isLoading={isAdcsPending}
                value={(availableAdcsConnections || []).find((conn) => conn.id === value) ?? null}
                onValueChange={(option) => {
                  onChange(option.id);
                }}
                options={availableAdcsConnections || []}
                placeholder="Select a Microsoft ADCS connection..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                creation={connectionCreation}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="template"
          render={({ field: { onChange, value, ...field }, fieldState: { error } }) => {
            if (isTemplatesLoading && !!selectedConnectionId) {
              return (
                <Field className="mb-4">
                  <FieldLabel>
                    Certificate Template <span className="text-danger">*</span>
                  </FieldLabel>
                  <Combobox
                    isLoading
                    isDisabled
                    modal
                    isClearable={false}
                    options={[]}
                    value={null}
                    onValueChange={() => {}}
                    getOptionLabel={() => ""}
                    getOptionValue={() => ""}
                    placeholder="Loading templates..."
                  />
                </Field>
              );
            }
            if (templates.length > 0) {
              return (
                <Field className="mb-4">
                  <FieldLabel>
                    Certificate Template <span className="text-danger">*</span>
                  </FieldLabel>
                  <Combobox
                    isError={Boolean(error)}
                    isDisabled={!selectedConnectionId}
                    modal
                    isClearable={false}
                    value={templates.find((t) => t.name === value) ? { label: value, value } : null}
                    onValueChange={(option) => onChange(option.value)}
                    options={templates.map((t) => ({ label: t.name, value: t.name }))}
                    placeholder="Select a template..."
                    getOptionLabel={(option) => option.label}
                    getOptionValue={(option) => option.value}
                  />
                  <FieldError errors={[error]} />
                </Field>
              );
            }
            return (
              <Field className="mb-4">
                <FieldLabel>
                  Certificate Template <span className="text-danger">*</span>
                </FieldLabel>
                <Input
                  {...field}
                  isError={Boolean(error)}
                  required
                  value={value}
                  onChange={onChange}
                  placeholder="SubCA"
                />
                <FieldDescription>
                  Enter the subordinate CA template name (e.g. SubCA).
                </FieldDescription>
                <FieldError errors={[error]} />
              </Field>
            );
          }}
        />
        <Controller
          control={control}
          name="maxPathLength"
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>Path Length</FieldLabel>
              <Select value={field.value} onValueChange={onChange}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {[-1, 0, 1, 2, 3].map((value) => (
                    <SelectItem value={String(value)} key={`ca-path-length-${value}`}>
                      {String(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" type="button">
            Cancel
          </Button>
        </DialogClose>
        <Button variant="neutral" type="submit" isPending={isSubmitting}>
          Install
        </Button>
      </DialogFooter>
    </form>
  );
};
