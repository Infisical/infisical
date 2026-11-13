import { Alert } from "@infisical/cipher/ui/alert";
import { DialogDescription, DialogHeader, DialogTitle } from "@infisical/cipher/ui/dialog";
import { Stack } from "@infisical/cipher/ui/layout";
import { SmallText, Text } from "@infisical/cipher/ui/text";

import { tierLabel } from "../billing-format";
import { daysLeftLabel, type DeprecatedEntry } from "./deprecation-data";

// "See what changes" dialog body: the sunset date with its countdown, the full reason and next steps.
export const DeprecationDetailBody = ({ entry }: { entry: DeprecatedEntry }) => {
  const { deprecation, name, planTier } = entry;
  const isProduct = deprecation.kind === "product";
  const urgent = deprecation.daysLeft !== null && deprecation.daysLeft <= 14;
  const label = daysLeftLabel(deprecation.daysLeft);
  const title = isProduct
    ? `${name} is being discontinued`
    : `The ${planTier ? tierLabel(planTier) : "current"} plan is being retired`;
  const subtitle = isProduct
    ? "This product is winding down"
    : `${planTier ? tierLabel(planTier) : "Current"} plan for ${name}`;
  const dateLine = deprecation.date
    ? `${isProduct ? "Access ends" : "Retires"} ${deprecation.date}`
    : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{subtitle}</DialogDescription>
      </DialogHeader>
      <Stack gap={16}>
        {dateLine && (
          <Alert tone={isProduct || urgent ? "bad" : "warn"} title={dateLine}>
            {label}
          </Alert>
        )}
        {deprecation.reason && (
          <Stack gap={4}>
            <SmallText muted>Why</SmallText>
            <Text>{deprecation.reason}</Text>
          </Stack>
        )}
        {deprecation.nextSteps && (
          <Stack gap={4}>
            <SmallText muted>What to do</SmallText>
            <Text>{deprecation.nextSteps}</Text>
          </Stack>
        )}
      </Stack>
    </>
  );
};
