import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useProject } from "@app/context";
import {
  CaRenewalType,
  CaSigningConfigType,
  useGetCaSigningConfig,
  useInstallCaCertificateAdcs,
  useInstallCaCertificateVenafi,
  useRenewCa
} from "@app/hooks/api/ca";
import { UsePopUpState } from "@app/hooks/usePopUp";

const caRenewalTypes = [{ label: "Renew with same key pair", value: CaRenewalType.EXISTING }];

const isValidDate = (dateString: string) => {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};

const schema = z
  .object({
    type: z.enum([CaRenewalType.EXISTING]),
    notAfter: z.string().trim().refine(isValidDate, { message: "Invalid date format" })
  })
  .required();

export type FormData = z.infer<typeof schema>;

type ExternalCaRenewalProps = {
  description: string;
  buttonLabel: string;
  onRenew: () => void;
  isRenewing: boolean;
  onCancel: () => void;
};

const ExternalCaRenewal = ({
  description,
  buttonLabel,
  onRenew,
  isRenewing,
  onCancel
}: ExternalCaRenewalProps) => (
  <div>
    <p className="mb-4 text-sm text-mineshaft-300">{description}</p>
    <div className="flex items-center">
      <Button
        className="mr-4"
        size="sm"
        onClick={onRenew}
        isLoading={isRenewing}
        isDisabled={isRenewing}
      >
        {buttonLabel}
      </Button>
      <Button colorSchema="secondary" variant="plain" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </div>
);

type Props = {
  popUp: UsePopUpState<["renewCa"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["renewCa"]>, state?: boolean) => void;
};

export const CaRenewalModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const projectSlug = currentProject?.slug || "";

  const popUpData = popUp?.renewCa?.data as {
    caId: string;
  };

  const caId = popUpData?.caId || "";

  const { data: signingConfig } = useGetCaSigningConfig(caId, {
    enabled: !!caId
  });

  const isVenafi = signingConfig?.type === CaSigningConfigType.VENAFI;
  const isAdcs = signingConfig?.type === CaSigningConfigType.AZURE_ADCS;

  const { mutateAsync: renewCa } = useRenewCa();
  const { mutateAsync: installVenafiCert, isPending: isVenafiRenewing } =
    useInstallCaCertificateVenafi(currentProject.id);
  const { mutateAsync: installAdcsCert, isPending: isAdcsRenewing } = useInstallCaCertificateAdcs(
    currentProject.id
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: CaRenewalType.EXISTING,
      notAfter: ""
    }
  });

  const onFormSubmit = async ({ type, notAfter }: FormData) => {
    if (!projectSlug || !popUpData.caId) return;

    try {
      await renewCa({
        projectSlug,
        caId: popUpData.caId,
        notAfter,
        type
      });

      handlePopUpToggle("renewCa", false);

      createNotification({
        text: "Successfully renewed CA",
        type: "success"
      });

      reset();
    } catch (err) {
      createNotification({
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Failed to renew CA",
        type: "error"
      });
    }
  };

  const onVenafiRenew = async () => {
    if (!caId) return;

    try {
      await installVenafiCert({
        caId
      });

      handlePopUpToggle("renewCa", false);

      createNotification({
        text: "Certificate renewal has been queued",
        type: "success"
      });
    } catch (err) {
      createNotification({
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Failed to renew CA certificate via Venafi",
        type: "error"
      });
    }
  };

  const onAdcsRenew = async () => {
    if (!caId) return;

    try {
      await installAdcsCert({
        caId
      });

      handlePopUpToggle("renewCa", false);

      createNotification({
        text: "Certificate renewal has been queued",
        type: "success"
      });
    } catch (err) {
      createNotification({
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Failed to renew CA certificate via ADCS",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.renewCa?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("renewCa", isOpen);
        reset();
      }}
    >
      <ModalContent title="Renew CA">
        {isVenafi || isAdcs ? (
          <ExternalCaRenewal
            description={
              isVenafi
                ? "This CA is configured to use Venafi TLS Protect Cloud for signing. Clicking renew will submit a new CSR to Venafi and install the renewed certificate."
                : "This CA is configured to use Azure ADCS for signing. Clicking renew will submit a new CSR to ADCS and install the renewed certificate."
            }
            buttonLabel={isVenafi ? "Renew via Venafi" : "Renew via ADCS"}
            onRenew={isVenafi ? onVenafiRenew : onAdcsRenew}
            isRenewing={isVenafi ? isVenafiRenewing : isAdcsRenewing}
            onCancel={() => handlePopUpToggle("renewCa", false)}
          />
        ) : (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="type"
              defaultValue={CaRenewalType.EXISTING}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="CA Renewal Method"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                  >
                    {caRenewalTypes.map(({ label, value }) => (
                      <SelectItem value={String(value || "")} key={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="notAfter"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Valid Until"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <Input {...field} placeholder="YYYY-MM-DD" />
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
                Renew
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpToggle("renewCa", false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
};
