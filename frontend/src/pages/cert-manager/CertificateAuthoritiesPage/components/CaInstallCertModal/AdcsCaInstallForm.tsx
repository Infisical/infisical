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
  useInstallCaCertificateAdcs,
  useUpdateCaSigningConfig
} from "@app/hooks/api";
import {
  TAvailableAppConnection,
  useListAvailableAppConnections
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  appConnectionId: z.string().min(1, "App connection is required"),
  template: z.string().min(1, "Certificate template is required"),
  validityPeriod: z.string().optional().or(z.literal("")),
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
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      maxPathLength: "-1"
    }
  });

  const { data: existingSigningConfig } = useGetCaSigningConfig(caId, { enabled: !!caId });
  const { mutateAsync: createSigningConfig } = useCreateCaSigningConfig();
  const { mutateAsync: updateSigningConfig } = useUpdateCaSigningConfig();
  const { mutateAsync: installAdcsCert } = useInstallCaCertificateAdcs(currentProject.id);

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
        ...(validityPeriod && { validityPeriod })
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
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="appConnectionId"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl
            label="Azure AD CS Connection"
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
              placeholder="Select an Azure AD CS connection..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="template"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Certificate Template"
            errorText={error?.message}
            isError={Boolean(error)}
            isRequired
            helperText="The ADCS certificate template name (e.g. SubCA)"
          >
            <Input {...field} placeholder="SubCA" />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="validityPeriod"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Validity Period"
            errorText={error?.message}
            isError={Boolean(error)}
            helperText="Optional TTL (e.g. 365d, 1y)"
          >
            <Input {...field} placeholder="365d" />
          </FormControl>
        )}
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
