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
        <p className={twMerge("text-xs font-medium text-mineshaft-400", labelClassName)}>{label}</p>
      </div>
      {children ? (
        <p className={twMerge("text-sm text-mineshaft-100", truncate && "truncate")}>{children}</p>
      ) : (
        <p className="text-sm italic text-mineshaft-400/50">None</p>
      )}
    </div>
  );
};
