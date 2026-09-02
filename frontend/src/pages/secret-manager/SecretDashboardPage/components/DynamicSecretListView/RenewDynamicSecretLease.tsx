import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, DialogFooter, Field, FieldFeedback, FieldLabel, Input } from "@app/components/v3";
import { useRenewDynamicSecretLease } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

type Props = {
  onClose: () => void;
  leaseId: string;
  dynamicSecretName: string;
  dynamicSecret: TDynamicSecret;
  projectSlug: string;
  environment: string;
  secretPath: string;
};

export const RenewDynamicSecretLease = ({
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
    <form onSubmit={handleSubmit(handleDynamicSecretLeaseCreate)}>
      <Controller
        control={control}
        name="ttl"
        defaultValue={dynamicSecret.defaultTTL}
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="renew-lease-ttl">TTL</FieldLabel>
            <Input
              {...field}
              id="renew-lease-ttl"
              isError={Boolean(error)}
              aria-describedby="renew-lease-ttl-feedback"
            />
            <FieldFeedback
              id="renew-lease-ttl-feedback"
              description="The existing expiration time will be extended by this TTL."
              error={error?.message}
            />
          </Field>
        )}
      />
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="project" size="sm" isPending={isSubmitting}>
          Renew Lease
        </Button>
      </DialogFooter>
    </form>
  );
};
