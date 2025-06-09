import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type Props = {
  label: string;
  children?: ReactNode;
  className?: string;
  labelClassName?: string;
  truncate?: boolean;
};

export const GenericFieldLabel = ({
  label,
  children,
  className,
  labelClassName,
  truncate
}: Props) => {
  return (
    <div className={twMerge("min-w-0", className)}>
      <p className={twMerge("text-xs font-medium text-mineshaft-400", labelClassName)}>{label}</p>
      {children ? (
        <p className={twMerge("text-sm text-mineshaft-100", truncate && "truncate")}>{children}</p>
      ) : (
        <p className="text-sm italic text-mineshaft-400/50">None</p>
      )}
    </div>
  );
};
