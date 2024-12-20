import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useRenewDynamicSecretLease } from "@app/hooks/api";

const formSchema = z.object({
  ttl: z.string().superRefine((val, ctx) => {
    if (!val) return;
    const valMs = ms(val);
    if (valMs < 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
    // a day
    if (valMs > 24 * 60 * 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
  })
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  leaseId: string;
  dynamicSecretName: string;
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
  environment
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ttl: "1h"
    }
  });

  const renewDynamicSecretLease = useRenewDynamicSecretLease();

  const handleDynamicSecretLeaseCreate = async ({ ttl }: TForm) => {
    if (renewDynamicSecretLease.isPending) return;
    try {
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
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to renew lease"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(handleDynamicSecretLeaseCreate)}>
      <Controller
        control={control}
        name="ttl"
        defaultValue="1h"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label={<TtlFormLabel label="TTL" />}
            isError={Boolean(error?.message)}
            errorText={error?.message}
            helperText="The existing expiration time will be extended by the TTL"
          >
            <Input {...field} />
          </FormControl>
        )}
      />
      <div className="mt-4 flex items-center space-x-4">
        <Button type="submit" isLoading={isSubmitting}>
          Renew
        </Button>
        <Button variant="outline_bg" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
