import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import {
  useAddResourceAwsAuth,
  useGetResourceAwsAuth,
  useUpdateResourceAwsAuth
} from "@app/hooks/api/resourceAuthMethods";

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
  isUpdate?: boolean;
  onClose: () => void;
};

export const GatewayAwsAuthForm = ({ gatewayId, isUpdate, onClose }: Props) => {
  const { data } = useGetResourceAwsAuth({ type: "gateway", id: gatewayId }, isUpdate ?? false);
  const { mutateAsync: add } = useAddResourceAwsAuth();
  const { mutateAsync: update } = useUpdateResourceAwsAuth();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      stsEndpoint: "https://sts.amazonaws.com/",
      allowedPrincipalArns: "",
      allowedAccountIds: ""
    }
  });

  useEffect(() => {
    if (data) {
      reset({
        stsEndpoint: data.stsEndpoint,
        allowedPrincipalArns: data.allowedPrincipalArns,
        allowedAccountIds: data.allowedAccountIds
      });
    }
  }, [data]);

  const onSubmit = async (form: FormData) => {
    const payload = {
      resource: { type: "gateway" as const, id: gatewayId },
      stsEndpoint: form.stsEndpoint,
      allowedPrincipalArns: form.allowedPrincipalArns,
      allowedAccountIds: form.allowedAccountIds
    };

    if (isUpdate) await update(payload);
    else await add(payload);

    createNotification({
      type: "success",
      text: `Successfully ${isUpdate ? "updated" : "configured"} AWS auth`
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        control={control}
        name="allowedPrincipalArns"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Allowed Principal ARNs"
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input
              {...field}
              placeholder="arn:aws:iam::123456789012:role/MyRoleName, arn:aws:iam::123456789012:user/MyUserName..."
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="allowedAccountIds"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Allowed Account IDs"
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input {...field} placeholder="123456789012, ..." />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="stsEndpoint"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="STS Endpoint" isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} placeholder="https://sts.amazonaws.com/" />
          </FormControl>
        )}
      />
      <div className="mt-4 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {isUpdate ? "Update" : "Add"}
        </Button>
        <Button colorSchema="secondary" variant="plain" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
