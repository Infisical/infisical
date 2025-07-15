import { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { Badge, Button, FormControl, Select, SelectItem, Tooltip } from "@app/components/v2";
import { useServerConfig, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useGetServerRootKmsEncryptionDetails,
  useUpdateServerEncryptionStrategy
} from "@app/hooks/api";
import { RootKeyEncryptionStrategy } from "@app/hooks/api/admin/types";

const formSchema = z.object({
  encryptionStrategy: z.nativeEnum(RootKeyEncryptionStrategy)
});

const strategies: Record<RootKeyEncryptionStrategy, string> = {
  [RootKeyEncryptionStrategy.Software]: "Software-based Encryption",
  [RootKeyEncryptionStrategy.HSM]: "Hardware Security Module (HSM)"
};

type TForm = z.infer<typeof formSchema>;

export const EncryptionPageForm = () => {
  const { data: rootKmsDetails } = useGetServerRootKmsEncryptionDetails();

  const { mutateAsync: updateEncryptionStrategy } = useUpdateServerEncryptionStrategy();
  const { config } = useServerConfig();
  const { subscription } = useSubscription();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      encryptionStrategy:
        rootKmsDetails?.strategies?.find((s) => s.enabled)?.strategy ??
        RootKeyEncryptionStrategy.Software
    }
  });

  const onSubmit = useCallback(async (formData: TForm) => {
    if (!subscription) return;

    if (!subscription.hsm) {
      handlePopUpOpen("upgradePlan", {
        description: "Hardware Security Module's (HSM's), are only available on Enterprise plans."
      });
      return;
    }

    try {
      await updateEncryptionStrategy(formData.encryptionStrategy);

      createNotification({
        type: "success",
        text: "Encryption strategy updated successfully"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to update encryption strategy"
      });
    }
  }, []);

  return (
    <>
      <form
        className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="flex flex-col justify-start">
          <div className="flex w-full justify-between">
            <div className="mb-2 text-xl font-semibold text-mineshaft-100">
              KMS Encryption Strategy
            </div>
          </div>
          <div className="mb-4 max-w-sm text-sm text-mineshaft-400">
            Select which type of encryption strategy you want to use for your KMS root key. HSM is
            supported on Enterprise plans.
          </div>

          {!!rootKmsDetails && (
            <Controller
              control={control}
              name="encryptionStrategy"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  className="max-w-sm"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    className="w-full bg-mineshaft-700"
                    dropdownContainerClassName="bg-mineshaft-800"
                    defaultValue={field.value}
                    onValueChange={(e) => onChange(e)}
                    {...field}
                  >
                    {rootKmsDetails.strategies?.map((strategy) => (
                      <SelectItem key={strategy.strategy} value={strategy.strategy}>
                        {strategies[strategy.strategy]}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          )}
        </div>

        <div className="flex w-full items-center justify-between">
          <Button
            className="mt-2"
            type="submit"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            Save
          </Button>

          {config.fipsEnabled && (
            <Tooltip content="FIPS mode of operation is enabled for your instance. All cryptographic operations within the FIPS boundaries are validated to be FIPS compliant.">
              <div>
                <Badge className="flex items-center gap-2" variant="primary">
                  FIPS Mode: Enabled
                  <FontAwesomeIcon icon={faInfoCircle} />
                </Badge>
              </div>
            </Tooltip>
          )}
        </div>
      </form>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
    </>
  );
};
