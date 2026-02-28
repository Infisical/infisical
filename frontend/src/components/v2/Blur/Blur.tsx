import { twMerge } from "tailwind-merge";

import { Tooltip } from "../Tooltip/Tooltip";

interface IProps {
  className?: string;
  tooltipText?: string;
}

export const Blur = ({ className, tooltipText }: IProps) => {
  return (
    <Tooltip content={tooltipText} className="max-w-md" isDisabled={!tooltipText}>
      <div
        className={twMerge("flex w-80 grow items-center py-1 pr-2 pl-4", className)}
        tabIndex={0}
        role="button"
      >
        <span className="blur-sm">xxxxxxxxxxxx</span>
      </div>
    </Tooltip>
  );
};
