import { Fragment, ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import { CUSTOM_LEVEL } from "./agentVaultPolicyModel";

export type TLevelOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  isDisabled?: boolean;
  hasSeparatorBefore?: boolean;
};

type Props = {
  value: string;
  options: TLevelOption[];
  ariaLabel: string;
  isDisabled?: boolean;
  placeholder?: string;
  className?: string;
  onLevelChange: (level: string) => void;
  // Custom isn't a set of actions to apply, so picking it only opens the actions to tick.
  onCustom: () => void;
};

export const LevelSelect = ({
  value,
  options,
  ariaLabel,
  isDisabled,
  placeholder,
  className,
  onLevelChange,
  onCustom
}: Props) => (
  <Select
    value={value}
    disabled={isDisabled}
    onValueChange={(next) => (next === CUSTOM_LEVEL ? onCustom() : onLevelChange(next))}
  >
    <SelectTrigger size="sm" className={cn("w-40", className)} aria-label={ariaLabel}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent position="popper" align="end">
      {options.map((option) => (
        <Fragment key={option.value}>
          {option.hasSeparatorBefore && <SelectSeparator />}
          <SelectItem
            value={option.value}
            disabled={option.isDisabled}
            description={option.description}
          >
            {option.label}
          </SelectItem>
        </Fragment>
      ))}
      <SelectSeparator />
      <SelectItem value={CUSTOM_LEVEL} description="Allow or deny actions one by one">
        Custom
      </SelectItem>
    </SelectContent>
  </Select>
);
