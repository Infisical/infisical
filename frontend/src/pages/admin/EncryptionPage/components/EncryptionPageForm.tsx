import { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
        isEnterpriseFeature: true,
        text: "Your current plan does not include access to Hardware Security Module (HSM). To unlock this feature, please upgrade to Infisical Enterprise plan."
      });
      return;
    }

    await updateEncryptionStrategy(formData.encryptionStrategy);

    createNotification({
      type: "success",
      text: "Encryption strategy updated successfully"
    });
  }, []);

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>KMS Encryption Strategy</CardTitle>
            <CardDescription>
              Select which type of encryption strategy you want to use for your KMS root key. HSM is
              supported on Enterprise plans.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!!rootKmsDetails && (
              <Controller
                control={control}
                name="encryptionStrategy"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <Field className="max-w-sm">
                    <FieldLabel htmlFor="server-encryption-strategy">
                      Encryption strategy
                    </FieldLabel>
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger
                        id="server-encryption-strategy"
                        isError={Boolean(error)}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {rootKmsDetails.strategies?.map((strategy) => (
                          <SelectItem key={strategy.strategy} value={strategy.strategy}>
                            {strategies[strategy.strategy]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}
          </CardContent>
          <CardFooter className="justify-end">
            {config.fipsEnabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="info" className="mr-auto">
                    FIPS Mode Enabled
                    <InfoIcon />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  FIPS mode is enabled. Cryptographic operations within the FIPS boundaries are
                  validated as FIPS compliant.
                </TooltipContent>
              </Tooltip>
            )}
            <Button variant="neutral" type="submit" isPending={isSubmitting} isDisabled={!isDirty}>
              Save Changes
            </Button>
          </CardFooter>
        </Card>
      </form>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={popUp.upgradePlan?.data?.text}
        isEnterpriseFeature={popUp.upgradePlan?.data?.isEnterpriseFeature}
      />
    </>
  );
};
