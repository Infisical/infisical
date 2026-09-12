import { useEffect } from "react";
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
import { useScopeVariant } from "@app/hooks";
import {
  certKeyAlgorithms,
  certKeyAlgorithmToNameMap,
  isPqcAlgorithm
} from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { useUpdateKmipServer } from "@app/hooks/api/kmipServers";
import { TKmipServerWithAuthMethod } from "@app/hooks/api/kmipServers/types";

const keyAlgorithmOptions = certKeyAlgorithms.filter(({ value }) => !isPqcAlgorithm(value));

const schema = z.object({
  hostnamesOrIps: z
    .string()
    .trim()
    .min(1, "At least one hostname or IP is required")
    .max(4096, "Hostnames or IPs must be at most 4096 characters"),
  keyAlgorithm: z.nativeEnum(CertKeyAlgorithm)
});

const toFormDefaults = (kmipServer: TKmipServerWithAuthMethod): FormData => ({
  hostnamesOrIps: kmipServer.hostnamesOrIps ?? "",
  keyAlgorithm: (kmipServer.keyAlgorithm as CertKeyAlgorithm) ?? CertKeyAlgorithm.RSA_2048
});

export const KmipServerCertConfigModal = ({ isOpen, onOpenChange, kmipServer }: Props) => {
  const { mutateAsync: updateKmipServer, isPending } = useUpdateKmipServer();
  const scopeVariant = useScopeVariant();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: toFormDefaults(kmipServer)
  });

  useEffect(() => {
    if (isOpen) reset(toFormDefaults(kmipServer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const onSubmit = async (form: FormData) => {
    try {
      await updateKmipServer({
        kmipServerId: kmipServer.id,
        hostnamesOrIps: form.hostnamesOrIps,
        keyAlgorithm: form.keyAlgorithm
      });
      createNotification({
        type: "success",
        text: "Certificate configuration updated. It applies at the next automatic certificate renewal; restart the KMIP server to apply it immediately."
      });
      onOpenChange(false);
    } catch {
      // MutationCache.onError already surfaces the API error.
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Certificate Configuration</DialogTitle>
          <DialogDescription>
            Changes apply when the server next renews its certificate. Restart the KMIP server to
            apply them immediately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="hostnamesOrIps"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="kmip-server-cert-hostnames">
                  Hostnames or IPs
                  <span aria-hidden className="text-danger">
                    *
                  </span>
                </FieldLabel>
                <Input
                  {...field}
                  id="kmip-server-cert-hostnames"
                  placeholder="kmip.example.com, 10.0.0.5"
                  aria-required
                  isError={Boolean(error)}
                />
                <FieldDescription>
                  Comma-separated list of the hostnames or IPs that KMIP clients will use to reach
                  this server. These become the server certificate&apos;s subject alternative names.
                </FieldDescription>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="keyAlgorithm"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="kmip-server-cert-key-algorithm">Key algorithm</FieldLabel>
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger
                    id="kmip-server-cert-key-algorithm"
                    isError={Boolean(error)}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {keyAlgorithmOptions.map(({ value: algorithm }) => (
                      <SelectItem value={algorithm} key={algorithm}>
                        {certKeyAlgorithmToNameMap[algorithm]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Key algorithm used to sign the server certificate.
                </FieldDescription>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={scopeVariant}
              isPending={isSubmitting || isPending}
              isDisabled={isSubmitting || isPending || !isDirty}
            >
              Update Certificate Configuration
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  kmipServer: TKmipServerWithAuthMethod;
};
