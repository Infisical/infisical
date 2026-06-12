import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  certKeyAlgorithms,
  certKeyAlgorithmToNameMap,
  isPqcAlgorithm
} from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { useUpdateKmipServer } from "@app/hooks/api/kmipServers";
import { TKmipServerWithAuthMethod } from "@app/hooks/api/kmipServers/types";

const keyAlgorithmOptions = certKeyAlgorithms
  .filter(({ value }) => !isPqcAlgorithm(value))
  .map(({ value }) => ({ value, label: certKeyAlgorithmToNameMap[value] }));

const schema = z.object({
  hostnamesOrIps: z
    .string()
    .trim()
    .min(1, "At least one hostname or IP is required")
    .max(4096, "Hostnames or IPs must be at most 4096 characters"),
  ttl: z.string().trim().min(1, "TTL is required").max(64, "TTL is too long"),
  keyAlgorithm: z.nativeEnum(CertKeyAlgorithm)
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  kmipServer: TKmipServerWithAuthMethod;
};

export const KmipServerCertConfigModal = ({ isOpen, onOpenChange, kmipServer }: Props) => {
  const { mutateAsync: updateKmipServer, isPending } = useUpdateKmipServer();
  const { isSubOrganization } = useOrganization();

  const defaults: FormData = {
    hostnamesOrIps: kmipServer.hostnamesOrIps ?? "",
    ttl: kmipServer.ttl ?? "1y",
    keyAlgorithm: (kmipServer.keyAlgorithm as CertKeyAlgorithm) ?? CertKeyAlgorithm.RSA_2048
  };

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: defaults
  });

  useEffect(() => {
    if (isOpen) reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const onSubmit = async (form: FormData) => {
    try {
      await updateKmipServer({
        kmipServerId: kmipServer.id,
        hostnamesOrIps: form.hostnamesOrIps,
        ttl: form.ttl,
        keyAlgorithm: form.keyAlgorithm
      });
      createNotification({
        type: "success",
        text: "Certificate configuration updated. Restart the KMIP server to apply it."
      });
      onOpenChange(false);
    } catch {
      createNotification({ type: "error", text: "Failed to update certificate configuration" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-visible">
        <DialogHeader>
          <DialogTitle>Edit Certificate Configuration</DialogTitle>
          <DialogDescription>
            Restart the KMIP server after saving for the new certificate to take effect.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={control}
            name="hostnamesOrIps"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Hostnames or IPs</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    isError={Boolean(error)}
                    placeholder="kmip.example.com, 10.0.0.5"
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="ttl"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Certificate TTL</FieldLabel>
                <FieldContent>
                  <Input {...field} isError={Boolean(error)} placeholder="1y" />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="keyAlgorithm"
            render={({ field }) => {
              const selected =
                keyAlgorithmOptions.find((o) => o.value === field.value) ?? keyAlgorithmOptions[0];
              return (
                <Field>
                  <FieldLabel>Key Algorithm</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      value={selected}
                      onChange={(opt) => {
                        const next = opt as { value: CertKeyAlgorithm } | null;
                        if (next) field.onChange(next.value);
                      }}
                      options={keyAlgorithmOptions}
                      isSearchable={false}
                      isClearable={false}
                      getOptionLabel={(o) => o.label}
                      getOptionValue={(o) => String(o.value)}
                    />
                  </FieldContent>
                </Field>
              );
            }}
          />

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={isSubOrganization ? "sub-org" : "org"}
              isPending={isSubmitting || isPending}
              isDisabled={isSubmitting || isPending || !isDirty}
            >
              Update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
