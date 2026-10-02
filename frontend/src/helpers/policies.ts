import { LucideIcon, UserCheckIcon, UserPenIcon } from "lucide-react";

import { TBadgeProps } from "@app/components/v3";
import { PolicyType } from "@app/hooks/api/policies/enums";

export const policyDetails: Record<
  PolicyType,
  { name: string; variant: TBadgeProps["variant"]; Icon: LucideIcon }
> = {
  [PolicyType.AccessPolicy]: {
    variant: "info",
    name: "Access Policy",
    Icon: UserCheckIcon
  },
  [PolicyType.ChangePolicy]: {
    variant: "neutral",
    name: "Change Policy",
    Icon: UserPenIcon
  }
};
