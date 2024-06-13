import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, ContentLoader, FormControl, Input } from "@app/components/v2";
import { useGetRateLimit, useUpdateRateLimit } from "@app/hooks/api";

const formSchema = z.object({
  readRateLimit: z.number(),
  writeRateLimit: z.number(),
  secretsRateLimit: z.number(),
  authRateLimit: z.number(),
  inviteUserRateLimit: z.number(),
  mfaRateLimit: z.number(),
  creationLimit: z.number(),
  publicEndpointLimit: z.number()
});

type TRateLimitForm = z.infer<typeof formSchema>;

export const RateLimitPanel = () => {
  const { data: rateLimit, isLoading } = useGetRateLimit();
  const { mutateAsync: updateRateLimit } = useUpdateRateLimit();

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = useForm<TRateLimitForm>({
    resolver: zodResolver(formSchema),
    values: {
      // eslint-disable-next-line
      readRateLimit: rateLimit?.readRateLimit ?? 600,
      writeRateLimit: rateLimit?.writeRateLimit ?? 200,
      secretsRateLimit: rateLimit?.secretsRateLimit ?? 60,
      authRateLimit: rateLimit?.authRateLimit ?? 60,
      inviteUserRateLimit: rateLimit?.inviteUserRateLimit ?? 30,
      mfaRateLimit: rateLimit?.mfaRateLimit ?? 20,
      creationLimit: rateLimit?.creationLimit ?? 30,
      publicEndpointLimit: rateLimit?.publicEndpointLimit ?? 30
    }
  });

  const onRateLimitFormSubmit = async (formData: TRateLimitForm) => {
    try {
      const {
        readRateLimit,
        writeRateLimit,
        secretsRateLimit,
        authRateLimit,
        inviteUserRateLimit,
        mfaRateLimit,
        creationLimit,
        publicEndpointLimit
      } = formData;

      await updateRateLimit({
        readRateLimit,
        writeRateLimit,
        secretsRateLimit,
        authRateLimit,
        inviteUserRateLimit,
        mfaRateLimit,
        creationLimit,
        publicEndpointLimit
      });
      createNotification({
        text: "Rate limits have been successfully updated. Please allow at least 10 minutes for the changes to take effect.",
        type: "success"
      });
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to update rate limiting setting."
      });
    }
  };

  return isLoading ? (
    <ContentLoader />
  ) : (
    <form
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      onSubmit={handleSubmit(onRateLimitFormSubmit)}
    >
      <div className="mb-8 flex flex-col justify-start">
        <div className="mb-4 text-xl font-semibold text-mineshaft-100">
          Set Rate Limits for your Infisical Instance
        </div>
        <Controller
          control={control}
          name="readRateLimit"
          defaultValue={300}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Global Read Requests per minute"
              className="w-72"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value}
                onChange={(e) => field.onChange(Number(e.target.value))}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          defaultValue={300}
          name="writeRateLimit"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Global Write Requests per minute"
              className="w-72"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value || ""}
                onChange={(e) => field.onChange(Number(e.target.value))}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          defaultValue={300}
          name="secretsRateLimit"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Secret Requests per minute"
              className="w-72"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value || ""}
                onChange={(e) => field.onChange(Number(e.target.value))}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          defaultValue={300}
          name="authRateLimit"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Auth Requests per minute"
              className="w-72"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value || ""}
                onChange={(e) => field.onChange(Number(e.target.value))}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          defaultValue={300}
          name="inviteUserRateLimit"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Invite User Requests per minute"
              className="w-72"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value || ""}
                onChange={(e) => field.onChange(Number(e.target.value))}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          defaultValue={300}
          name="mfaRateLimit"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Multi Factor Auth Requests per minute"
              className="w-72"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value || ""}
                onChange={(e) => field.onChange(Number(e.target.value))}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          defaultValue={300}
          name="creationLimit"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Creation Requests per minute"
              className="w-72"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value || ""}
                onChange={(e) => field.onChange(Number(e.target.value))}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          defaultValue={300}
          name="publicEndpointLimit"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Secret Sharing Requests per minute"
              className="w-72"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value || ""}
                onChange={(e) => field.onChange(Number(e.target.value))}
              />
            </FormControl>
          )}
        />
      </div>
      <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting || !isDirty}>
        Save
      </Button>
    </form>
  );
};
