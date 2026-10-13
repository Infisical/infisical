import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { FormControl, Input, Select, SelectItem } from "@app/components/v2";
import {
  Button,
  Combobox,
  DialogBody,
  DialogClose,
  DialogFooter,
  Field,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  CaSigningConfigType,
  useCreateCaSigningConfig,
  useGetCaSigningConfig,
  useInstallCaCertificateVenafi,
  useUpdateCaSigningConfig
} from "@app/hooks/api";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  useVenafiConnectionListApplications,
  useVenafiConnectionListIssuingTemplates
} from "@app/hooks/api/appConnections/venafi";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { useConnectionCreation } from "./useConnectionCreation";

const schema = z.object({
  appConnectionId: z.string().min(1, "App connection is required"),
  applicationId: z.string().min(1, "Application is required"),
  issuingTemplateId: z.string().min(1, "Issuing Template is required"),
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

export const VenafiCaInstallForm = ({ caId, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();

  const { data: availableVenafiConnections, isPending: isVenafiPending } =
    useListAvailableAppConnections(AppConnection.Venafi, currentProject.id);

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

  const connectionCreation = useConnectionCreation(AppConnection.Venafi, (connection) => {
    setValue("appConnectionId", connection.id, { shouldValidate: true });
    setValue("applicationId", "");
    setValue("issuingTemplateId", "");
  });

  const selectedConnectionId = watch("appConnectionId");
  const selectedApplicationId = watch("applicationId");

  const { data: applications = [], isPending: isApplicationsLoading } =
    useVenafiConnectionListApplications(selectedConnectionId ?? "", {
      enabled: !!selectedConnectionId
    });

  const { data: issuingTemplates = [], isPending: isTemplatesLoading } =
    useVenafiConnectionListIssuingTemplates(
      selectedConnectionId ?? "",
      selectedApplicationId ?? "",
      {
        enabled: !!selectedConnectionId && !!selectedApplicationId
      }
    );

  const { data: existingSigningConfig } = useGetCaSigningConfig(caId, { enabled: !!caId });
  const { mutateAsync: createSigningConfig } = useCreateCaSigningConfig();
  const { mutateAsync: updateSigningConfig } = useUpdateCaSigningConfig();
  const { mutateAsync: installVenafiCert } = useInstallCaCertificateVenafi();

  const onFormSubmit = async ({
    appConnectionId,
    applicationId,
    issuingTemplateId,
    validityPeriod,
    maxPathLength
  }: FormData) => {
    if (!caId) return;

    try {
      const signingConfigPayload = {
        applicationId,
        issuingTemplateId,
        ...(typeof validityPeriod === "number" && { validityPeriod })
      };

      if (existingSigningConfig?.type === CaSigningConfigType.VENAFI) {
        await updateSigningConfig({
          caId,
          appConnectionId,
          destinationConfig: signingConfigPayload
        });
      } else {
        await createSigningConfig({
          caId,
          type: CaSigningConfigType.VENAFI,
          appConnectionId,
          destinationConfig: signingConfigPayload
        });
      }

      await installVenafiCert({
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
          "Failed to install certificate via Venafi",
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
                Venafi Connection <span className="text-danger">*</span>
              </FieldLabel>
              <Combobox
                isError={Boolean(error)}
                modal
                isClearable={false}
                isLoading={isVenafiPending}
                value={(availableVenafiConnections || []).find((conn) => conn.id === value) ?? null}
                onValueChange={(option) => {
                  onChange(option.id);
                  setValue("applicationId", "");
                  setValue("issuingTemplateId", "");
                }}
                options={availableVenafiConnections || []}
                placeholder="Select a Venafi connection..."
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
          name="applicationId"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <FormControl
              label="Application"
              errorText={error?.message}
              isError={Boolean(error)}
              isRequired
            >
              <Combobox
                isLoading={isApplicationsLoading && !!selectedConnectionId}
                isDisabled={!selectedConnectionId}
                modal
                isClearable={false}
                value={applications.find((app) => app.id === value) ?? null}
                onValueChange={(option) => {
                  onChange(option.id);
                  setValue("issuingTemplateId", "");
                }}
                options={applications}
                placeholder={
                  selectedConnectionId ? "Select an application..." : "Select a connection first"
                }
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="issuingTemplateId"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <FormControl
              label="Issuing Template"
              errorText={error?.message}
              isError={Boolean(error)}
              isRequired
            >
              <Combobox
                isLoading={isTemplatesLoading && !!selectedApplicationId}
                isDisabled={!selectedApplicationId}
                modal
                isClearable={false}
                value={issuingTemplates.find((tmpl) => tmpl.id === value) ?? null}
                onValueChange={(option) => onChange(option.id)}
                options={issuingTemplates}
                placeholder={
                  selectedApplicationId
                    ? "Select an issuing template..."
                    : "Select an application first"
                }
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="validityPeriod"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Validity Period (Days)"
              errorText={error?.message}
              isError={Boolean(error)}
              helperText="Number of days the certificate should be valid"
            >
              <Input {...field} type="number" placeholder="365" />
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
