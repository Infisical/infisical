import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFieldLabel } from "@app/components/dynamic-secrets/shared/TtlFieldLabel";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  Input
} from "@app/components/v3";
import { useRenewDynamicSecretLease } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onClose: () => void;
  leaseId: string;
  dynamicSecretName: string;
  dynamicSecret: TDynamicSecret;
  projectSlug: string;
  environment: string;
  secretPath: string;
};

export const RenewDynamicSecretLease = ({
  isOpen,
  onOpenChange,
  onClose,
  projectSlug,
  dynamicSecretName,
  leaseId,
  secretPath,
  environment,
  dynamicSecret
}: Props) => {
  const maxTtlMs = dynamicSecret.maxTTL ? ms(dynamicSecret.maxTTL) : undefined;

  const formSchema = z.object({
    ttl: z.string().superRefine((val, ctx) => {
      if (!val) return;
      const valMs = ms(val);
      if (valMs < 1000)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "TTL must be greater than 1 second"
        });
      if (maxTtlMs && valMs > maxTtlMs)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `TTL must be less than ${dynamicSecret.maxTTL}`
        });
    })
  });

  type TForm = z.infer<typeof formSchema>;

  const {
    control,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ttl: dynamicSecret.defaultTTL
    }
  });

  const renewDynamicSecretLease = useRenewDynamicSecretLease();

  const handleDynamicSecretLeaseCreate = async ({ ttl }: TForm) => {
    if (renewDynamicSecretLease.isPending) return;
    await renewDynamicSecretLease.mutateAsync({
      environmentSlug: environment,
      projectSlug,
      path: secretPath,
      ttl,
      dynamicSecretName,
      leaseId
    });
    onClose();
    createNotification({
      type: "success",
      text: "Successfully renewed lease"
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renew Lease</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleDynamicSecretLeaseCreate)}>
          <Controller
            control={control}
            name="ttl"
            defaultValue={dynamicSecret.defaultTTL}
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <TtlFieldLabel htmlFor="renew-lease-ttl" label="TTL" />
                <Input id="renew-lease-ttl" {...field} isError={Boolean(error)} />
                <FieldDescription>
                  The existing expiration time will be extended by the TTL
                </FieldDescription>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button type="submit" isPending={isSubmitting}>
              Renew
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
