import { twMerge } from "tailwind-merge";

import { Tooltip } from "../Tooltip/Tooltip";

interface IProps {
  className?: string;
  tooltipText?: string;
}

export const Blur = ({ className, tooltipText }: IProps) => {
  return (
    <Tooltip content={tooltipText} isDisabled={!tooltipText}>
      <div
        className={twMerge("flex w-80 flex-grow items-center py-1 pl-4 pr-2", className)}
        tabIndex={0}
        role="button"
      >
        <span className="blur">********</span>
      </div>
    </Tooltip>
  );
};
