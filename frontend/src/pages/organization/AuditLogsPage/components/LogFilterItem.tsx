import { twMerge } from "tailwind-merge";

import { Button, Tooltip } from "@app/components/v2";

type Props = {
  hoverTooltip?: string;
  className?: string;
  label: string;
  onClear: () => void;
  children: React.ReactNode;
};

export const LogFilterItem = ({ label, onClear, hoverTooltip, children, className }: Props) => {
  return (
    <Tooltip className="relative top-4" content={hoverTooltip} isDisabled={!hoverTooltip}>
      <div className={twMerge("flex flex-col justify-between", className)}>
        <div className="flex items-center justify-between pr-1">
          <p className="text-xs opacity-60">{label}</p>
          <Button
            onClick={() => onClear()}
            variant="link"
            className="font-normal text-mineshaft-400 transition-all duration-75 hover:text-mineshaft-300"
            size="xs"
          >
            Clear
          </Button>
        </div>
        {children}
      </div>
    </Tooltip>
  );
};
