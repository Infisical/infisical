import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  SheetFooter
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useUpdateGateway } from "@app/hooks/api/gateways-v2";
import { GatewayAwsAuthConfig } from "@app/hooks/api/gateways-v2/types";

const schema = z
  .object({
    stsEndpoint: z.string(),
    allowedPrincipalArns: z.string(),
    allowedAccountIds: z.string()
  })
  .required()
  .refine(
    (data) =>
      data.allowedPrincipalArns.trim().length > 0 || data.allowedAccountIds.trim().length > 0,
    {
      message: "At least one of allowed principal ARNs or allowed account IDs must be set",
      path: ["allowedPrincipalArns"]
    }
  );

export type FormData = z.infer<typeof schema>;

type Props = {
  gatewayId: string;
  existingConfig: GatewayAwsAuthConfig | null;
  onClose: () => void;
};

export const GatewayAwsAuthForm = ({ gatewayId, existingConfig, onClose }: Props) => {
  const { mutateAsync: updateGateway } = useUpdateGateway();
  const { isSubOrganization } = useOrganization();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      stsEndpoint: existingConfig?.stsEndpoint ?? "https://sts.amazonaws.com/",
      allowedPrincipalArns: existingConfig?.allowedPrincipalArns ?? "",
      allowedAccountIds: existingConfig?.allowedAccountIds ?? ""
    }
  });

  useEffect(() => {
    if (existingConfig) {
      reset({
        stsEndpoint: existingConfig.stsEndpoint,
        allowedPrincipalArns: existingConfig.allowedPrincipalArns,
        allowedAccountIds: existingConfig.allowedAccountIds
      });
    }
  }, [existingConfig, reset]);

  const onSubmit = async (form: FormData) => {
    try {
      await updateGateway({
        gatewayId,
        authMethod: {
          method: "aws",
          stsEndpoint: form.stsEndpoint,
          allowedPrincipalArns: form.allowedPrincipalArns,
          allowedAccountIds: form.allowedAccountIds
        }
      });
      createNotification({ type: "success", text: "Auth method updated" });
      onClose();
    } catch {
      createNotification({ type: "error", text: "Failed to update auth method" });
    }
  };

  return (
    <form className="flex flex-1 flex-col overflow-hidden" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex min-h-0 flex-1 shrink flex-col gap-3 overflow-y-auto p-4 pb-8">
        <Controller
          control={control}
          name="allowedPrincipalArns"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Allowed Principal ARNs</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  isError={Boolean(error)}
                  placeholder="arn:aws:iam::123456789012:role/MyRoleName, arn:aws:iam::123456789012:user/MyUserName..."
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="allowedAccountIds"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Allowed Account IDs</FieldLabel>
              <FieldContent>
                <Input {...field} isError={Boolean(error)} placeholder="123456789012, ..." />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="stsEndpoint"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>STS Endpoint</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  isError={Boolean(error)}
                  placeholder="https://sts.amazonaws.com/"
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      </div>
      <SheetFooter className="shrink-0 border-t border-border">
        <Button
          isPending={isSubmitting}
          isDisabled={isSubmitting || !isDirty}
          variant={isSubOrganization ? "sub-org" : "org"}
          type="submit"
        >
          Update
        </Button>
        <Button onClick={onClose} variant="outline" className="mr-auto" type="button">
          Cancel
        </Button>
      </SheetFooter>
    </form>
  );
};
