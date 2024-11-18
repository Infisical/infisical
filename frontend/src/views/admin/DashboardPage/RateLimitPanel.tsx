import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, ContentLoader, FormControl, Input, UpgradePlanModal } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useGetRateLimit, useUpdateRateLimit } from "@app/hooks/api";

const formSchema = z.object({
  readRateLimit: z.number(),
  writeRateLimit: z.number(),
  secretsRateLimit: z.number(),
  authRateLimit: z.number(),
  inviteUserRateLimit: z.number(),
  mfaRateLimit: z.number(),
  publicEndpointLimit: z.number()
});

type TRateLimitForm = z.infer<typeof formSchema>;

export const RateLimitPanel = () => {
  const { data: rateLimit, isLoading } = useGetRateLimit();
  const { subscription } = useSubscription();
  const { mutateAsync: updateRateLimit } = useUpdateRateLimit();
  const { handlePopUpToggle, handlePopUpOpen, popUp } = usePopUp(["upgradePlan"] as const);

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
      publicEndpointLimit: rateLimit?.publicEndpointLimit ?? 30
    }
  });

  const onRateLimitFormSubmit = async (formData: TRateLimitForm) => {
    try {
      if (subscription && !subscription.customRateLimits) {
        handlePopUpOpen("upgradePlan");
        return;
      }

      const {
        readRateLimit,
        writeRateLimit,
        secretsRateLimit,
        authRateLimit,
        inviteUserRateLimit,
        mfaRateLimit,
        publicEndpointLimit
      } = formData;

      await updateRateLimit({
        readRateLimit,
        writeRateLimit,
        secretsRateLimit,
        authRateLimit,
        inviteUserRateLimit,
        mfaRateLimit,
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
        <div className="mb-4 text-xl font-semibold text-mineshaft-100">Configure rate limits</div>
        <Controller
          control={control}
          name="readRateLimit"
          defaultValue={300}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Global read requests per minute"
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
              label="Global write requests per minute"
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
              label="Secret requests per minute"
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
              label="Auth requests per minute"
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
              label="User invitation requests per minute"
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
              label="Multi factor auth requests per minute"
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
              label="Secret sharing requests per minute"
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
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can configure custom rate limits if you switch to Infisical's Enterprise plan."
      />
    </form>
  );
};
