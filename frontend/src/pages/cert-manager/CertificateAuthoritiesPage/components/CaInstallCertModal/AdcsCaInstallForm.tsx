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
  useInstallCaCertificateAdcs,
  useUpdateCaSigningConfig
} from "@app/hooks/api";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { useAzureAdcsConnectionListTemplates } from "@app/hooks/api/appConnections/azure-adcs";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  appConnectionId: z.string().min(1, "App connection is required"),
  template: z.string().min(1, "Certificate template is required"),
  validityPeriod: z.coerce
    .number()
    .int()
    .min(1, "Must be at least 1 day")
    .optional()
    .or(z.literal("")),
  maxPathLength: z.string()
});

type FormData = z.infer<typeof schema>;

type Props = {
  caId: string;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["installCaCert"]>, state?: boolean) => void;
};

export const AdcsCaInstallForm = ({ caId, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();

  const { data: availableAdcsConnections, isPending: isAdcsPending } =
    useListAvailableAppConnections(AppConnection.AzureADCS, currentProject.id);

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

  const connectionCreation = useConnectionCreation(AppConnection.AzureADCS, (connection) => {
    setValue("appConnectionId", connection.id, { shouldValidate: true });
  });

  const selectedConnectionId = watch("appConnectionId");

  const { data: templates = [], isPending: isTemplatesLoading } =
    useAzureAdcsConnectionListTemplates(selectedConnectionId ?? "", {
      enabled: !!selectedConnectionId
    });

  const { data: existingSigningConfig } = useGetCaSigningConfig(caId, { enabled: !!caId });
  const { mutateAsync: createSigningConfig } = useCreateCaSigningConfig();
  const { mutateAsync: updateSigningConfig } = useUpdateCaSigningConfig();
  const { mutateAsync: installAdcsCert } = useInstallCaCertificateAdcs();

  const onFormSubmit = async ({
    appConnectionId,
    template,
    validityPeriod,
    maxPathLength
  }: FormData) => {
    if (!caId) return;

    try {
      const destinationConfig = {
        template,
        ...(typeof validityPeriod === "number" && { validityPeriod })
      };

      if (existingSigningConfig?.type === CaSigningConfigType.AZURE_ADCS) {
        await updateSigningConfig({
          caId,
          appConnectionId,
          destinationConfig
        });
      } else {
        await createSigningConfig({
          caId,
          type: CaSigningConfigType.AZURE_ADCS,
          appConnectionId,
          destinationConfig
        });
      }

      await installAdcsCert({
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
          "Failed to install certificate via Azure AD CS",
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
                Azure AD CS Connection <span className="text-danger">*</span>
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
                placeholder="Select an Azure AD CS connection..."
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
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Certificate Template <span className="text-danger">*</span>
              </FieldLabel>
              <Combobox
                isError={Boolean(error)}
                isLoading={isTemplatesLoading && !!selectedConnectionId}
                isDisabled={!selectedConnectionId}
                modal
                isClearable={false}
                value={templates.find((t) => t === value) ? { label: value, value } : null}
                onValueChange={(option) => onChange(option.value)}
                options={templates.map((t) => ({ label: t, value: t }))}
                placeholder={
                  selectedConnectionId ? "Select a template..." : "Select a connection first"
                }
                getOptionLabel={(option) => option.label}
                getOptionValue={(option) => option.value}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="validityPeriod"
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>Validity Period (Days)</FieldLabel>
              <Input {...field} isError={Boolean(error)} type="number" placeholder="365" />
              <FieldDescription>Number of days the certificate should be valid</FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
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
