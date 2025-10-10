import { ReactNode } from "react";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

type Props = {
  label: string;
  children?: ReactNode;
  className?: string;
  labelClassName?: string;
  truncate?: boolean;
  icon?: IconDefinition;
};

export const GenericFieldLabel = ({
  label,
  children,
  className,
  labelClassName,
  truncate,
  icon
}: Props) => {
  return (
    <div className={twMerge("min-w-0", className)}>
      <div className="flex items-center gap-1.5">
        {icon && <FontAwesomeIcon icon={icon} className="text-mineshaft-400" size="sm" />}
        <p className={twMerge("text-mineshaft-400 text-xs font-medium", labelClassName)}>{label}</p>
      </div>
      {children ? (
        <p className={twMerge("text-mineshaft-100 text-sm", truncate && "truncate")}>{children}</p>
      ) : (
        <p className="text-mineshaft-400/50 text-sm italic">None</p>
      )}
    </div>
  );
};
