import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faArrowRightToBracket, faEdit } from "@fortawesome/free-solid-svg-icons";

import { PolicyType } from "@app/hooks/api/policies/enums";

export const policyDetails: Record<
  PolicyType,
  { name: string; className: string; icon: IconDefinition }
> = {
  [PolicyType.AccessPolicy]: {
    className: "bg-green/20 text-green",
    name: "Access Policy",
    icon: faArrowRightToBracket
  },
  [PolicyType.ChangePolicy]: {
    className: "bg-yellow/20 text-yellow",
    name: "Change Policy",
    icon: faEdit
  }
};
