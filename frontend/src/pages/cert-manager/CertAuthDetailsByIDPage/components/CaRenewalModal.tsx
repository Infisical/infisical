import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
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

type Props = {
  popUp: UsePopUpState<["renewCa"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["renewCa"]>, state?: boolean) => void;
};

export const CaRenewalModal = ({ popUp, handlePopUpToggle }: Props) => {
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
    useInstallCaCertificateVenafi();
  const { mutateAsync: installAdcsCert, isPending: isAdcsRenewing } = useInstallCaCertificateAdcs();

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
    if (!popUpData.caId) return;

    try {
      await renewCa({
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
    <Dialog
      open={popUp?.renewCa?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("renewCa", isOpen);
        reset();
      }}
    >
      <DialogContent isPending={isSubmitting || isVenafiRenewing || isAdcsRenewing}>
        <DialogHeader>
          <DialogTitle>Renew CA</DialogTitle>
          {(isVenafi || isAdcs) && (
            <DialogDescription>
              {isVenafi
                ? "This CA is configured to use Venafi TLS Protect Cloud for signing. Clicking renew will submit a new CSR to Venafi and install the renewed certificate."
                : "This CA is configured to use Azure ADCS for signing. Clicking renew will submit a new CSR to ADCS and install the renewed certificate."}
            </DialogDescription>
          )}
        </DialogHeader>
        {isVenafi || isAdcs ? (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="project"
              onClick={isVenafi ? onVenafiRenew : onAdcsRenew}
              isPending={isVenafi ? isVenafiRenewing : isAdcsRenewing}
            >
              {isVenafi ? "Renew via Venafi" : "Renew via ADCS"}
            </Button>
          </DialogFooter>
        ) : (
          <form className="flex flex-col gap-6" onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="type"
              defaultValue={CaRenewalType.EXISTING}
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="ca-renewal-type">CA Renewal Method</FieldLabel>
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger id="ca-renewal-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {caRenewalTypes.map(({ label, value: renewalType }) => (
                        <SelectItem value={String(renewalType || "")} key={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="notAfter"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="ca-renewal-not-after">
                    Valid Until <span className="text-danger">*</span>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="ca-renewal-not-after"
                    placeholder="YYYY-MM-DD"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="project" isPending={isSubmitting}>
                Renew
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
