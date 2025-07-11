import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Button, Tooltip } from "@app/components/v2";

type Props = {
  hoverTooltip?: string;
  className?: string;
  label: string;
  onClear: () => void;
  children: React.ReactNode;
  tooltipText?: string;
};

export const LogFilterItem = ({
  label,
  onClear,
  hoverTooltip,
  children,
  className,
  tooltipText
}: Props) => {
  return (
    <div className={twMerge("flex flex-col justify-between", className)}>
      <div className="flex items-center pr-1">
        <p className="text-xs opacity-60">{label}</p>
        {tooltipText && (
          <Tooltip content={tooltipText} className="max-w-sm">
            <FontAwesomeIcon
              icon={faInfoCircle}
              className="-mt-[0.05rem] ml-1 text-[11px] text-mineshaft-400"
            />
          </Tooltip>
        )}
        <Button
          onClick={() => onClear()}
          variant="link"
          className="ml-auto font-normal text-mineshaft-400 transition-all duration-75 hover:text-mineshaft-300"
          size="xs"
        >
          Clear
        </Button>
      </div>
      <Tooltip className="relative top-4" content={hoverTooltip} isDisabled={!hoverTooltip}>
        <div>{children}</div>
      </Tooltip>
    </div>
  );
};
