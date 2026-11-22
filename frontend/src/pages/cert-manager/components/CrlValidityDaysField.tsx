import { Control, Controller, FieldValues, Path, UseFormTrigger } from "react-hook-form";
import { z } from "zod";

import {
  CertificateRevocationListsUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import {
  Badge,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import {
  DEFAULT_CRL_VALIDITY_DAYS,
  MAX_CRL_VALIDITY_DAYS,
  MIN_CRL_VALIDITY_DAYS
} from "@app/hooks/api/ca";

export const crlValidityDaysSchema = z.coerce
  .number()
  .int("Must be a whole number of days")
  .min(MIN_CRL_VALIDITY_DAYS, `Must be at least ${MIN_CRL_VALIDITY_DAYS} day`)
  .max(MAX_CRL_VALIDITY_DAYS, `Must be ${MAX_CRL_VALIDITY_DAYS} days or less`);

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  trigger: UseFormTrigger<T>;
  isCaExpired?: boolean;
};

export const CrlValidityDaysField = <T extends FieldValues>({
  control,
  name,
  trigger,
  isCaExpired
}: Props<T>) => {
  const { subscription } = useSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const isPlanLocked = !subscription.caCrl;

  const handleLockedClick = () => {
    if (!isPlanLocked) return;
    openUpgradeGate({
      intent: {
        ...CertificateRevocationListsUpgradeIntent,
        upgradeLabel: "Unlock CRL Validity",
        title: "Set CRL Validity",
        description:
          "Custom CRL validity is included with the Enterprise plan. Review the plan to continue."
      },
      paywallKey: "cert-manager.ca-crl-validity"
    });
  };

  return (
    <>
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState: { error } }) => {
          const handleValueChange = (value: string | number) => {
            field.onChange(value);
            if (error) trigger(name);
          };

          return (
            <Field>
              <FieldLabel htmlFor="crl-validity-days">
                CRL Validity (Days)
                {isPlanLocked && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="info">Enterprise</Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Custom CRL validity is available on Infisical&apos;s Enterprise plan.
                    </TooltipContent>
                  </Tooltip>
                )}
              </FieldLabel>
              <FieldContent>
                <div className="flex items-center gap-2">
                  <Input
                    {...field}
                    onChange={(event) => handleValueChange(event.target.value)}
                    onClick={handleLockedClick}
                    onKeyDown={(event) => {
                      const isEditKey =
                        event.key.length === 1 ||
                        event.key === "Enter" ||
                        event.key === "Backspace";
                      if (isEditKey && !event.metaKey && !event.ctrlKey) handleLockedClick();
                    }}
                    id="crl-validity-days"
                    type="number"
                    readOnly={isPlanLocked}
                    disabled={isCaExpired}
                    isError={Boolean(error)}
                  />
                  {isPlanLocked &&
                    !isCaExpired &&
                    Number(field.value) !== DEFAULT_CRL_VALIDITY_DAYS && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleValueChange(DEFAULT_CRL_VALIDITY_DAYS)}
                      >
                        Reset to {DEFAULT_CRL_VALIDITY_DAYS} Days
                      </Button>
                    )}
                </div>
                <FieldDescription>
                  {isCaExpired
                    ? "This CA has expired. Renew it to change the CRL validity."
                    : `How long each CRL is valid, from ${MIN_CRL_VALIDITY_DAYS} to ${MAX_CRL_VALIDITY_DAYS} days. The CRL is regenerated automatically before it expires.`}
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          );
        }}
      />
      {upgradeGate}
    </>
  );
};
