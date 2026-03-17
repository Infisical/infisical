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

  const { mutateAsync: renewCa } = useRenewCa();
  const { mutateAsync: installVenafiCert, isPending: isVenafiRenewing } =
    useInstallCaCertificateVenafi(currentProject.id);

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

  return (
    <Modal
      isOpen={popUp?.renewCa?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("renewCa", isOpen);
        reset();
      }}
    >
      <ModalContent title="Renew CA">
        {isVenafi ? (
          <div>
            <p className="mb-4 text-sm text-mineshaft-300">
              This CA is configured to use Venafi TLS Protect Cloud for signing. Clicking renew will
              submit a new CSR to Venafi and install the renewed certificate.
            </p>
            <div className="flex items-center">
              <Button
                className="mr-4"
                size="sm"
                onClick={onVenafiRenew}
                isLoading={isVenafiRenewing}
                isDisabled={isVenafiRenewing}
              >
                Renew via Venafi
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpToggle("renewCa", false)}
              >
                Cancel
              </Button>
            </div>
          </div>
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
