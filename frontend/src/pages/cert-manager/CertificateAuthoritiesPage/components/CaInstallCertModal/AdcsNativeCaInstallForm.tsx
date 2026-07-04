import { Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
import { useProject } from "@app/context";
import {
  CaSigningConfigType,
  useCreateCaSigningConfig,
  useGetCaSigningConfig,
  useInstallCaCertificateAdcsNative,
  useUpdateCaSigningConfig
} from "@app/hooks/api";
import {
  TAvailableAppConnection,
  useListAvailableAppConnections
} from "@app/hooks/api/appConnections";
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
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      maxPathLength: "-1"
    }
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
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="appConnectionId"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl
            label="ADCS Connection"
            errorText={error?.message}
            isError={Boolean(error)}
            isRequired
          >
            <FilterableSelect
              isLoading={isAdcsPending}
              value={(availableAdcsConnections || []).find((conn) => conn.id === value)}
              onChange={(option) => {
                const selected = option as SingleValue<TAvailableAppConnection>;
                onChange(selected?.id ?? "");
              }}
              options={availableAdcsConnections || []}
              placeholder="Select an ADCS connection..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="template"
        render={({ field: { onChange, value, ...field }, fieldState: { error } }) => {
          if (isTemplatesLoading && !!selectedConnectionId) {
            return (
              <FormControl label="Certificate Template" isRequired>
                <FilterableSelect
                  isLoading
                  isDisabled
                  options={[]}
                  value={null}
                  onChange={() => {}}
                  placeholder="Loading templates..."
                />
              </FormControl>
            );
          }
          if (templates.length > 0) {
            return (
              <FormControl
                label="Certificate Template"
                errorText={error?.message}
                isError={Boolean(error)}
                isRequired
              >
                <FilterableSelect
                  isDisabled={!selectedConnectionId}
                  value={templates.find((t) => t.name === value) ? { label: value, value } : null}
                  onChange={(option) => {
                    const selected = option as SingleValue<{ label: string; value: string }>;
                    onChange(selected?.value ?? "");
                  }}
                  options={templates.map((t) => ({ label: t.name, value: t.name }))}
                  placeholder="Select a template..."
                  getOptionLabel={(option) => option.label}
                  getOptionValue={(option) => option.value}
                />
              </FormControl>
            );
          }
          return (
            <FormControl
              label="Certificate Template"
              errorText={error?.message}
              isError={Boolean(error)}
              isRequired
              helperText="Enter the subordinate CA template name (e.g. SubCA)."
            >
              <Input {...field} value={value} onChange={onChange} placeholder="SubCA" />
            </FormControl>
          );
        }}
      />
      <Controller
        control={control}
        name="maxPathLength"
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Path Length" errorText={error?.message} isError={Boolean(error)}>
            <Select {...field} onValueChange={onChange} className="w-full">
              {[-1, 0, 1, 2, 3].map((value) => (
                <SelectItem value={String(value)} key={`ca-path-length-${value}`}>
                  {String(value)}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          Install
        </Button>
        <Button
          colorSchema="secondary"
          variant="plain"
          onClick={() => handlePopUpToggle("installCaCert", false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};
