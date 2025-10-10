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
        className={twMerge("flex w-80 grow items-center py-1 pl-4 pr-2", className)}
        tabIndex={0}
        role="button"
      >
        <span className="blur-sm">********</span>
      </div>
    </Tooltip>
  );
};
