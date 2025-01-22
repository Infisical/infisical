import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type Props = {
  label: string;
  children?: ReactNode;
  className?: string;
  labelClassName?: string;
};

export const SecretSyncLabel = ({ label, children, className, labelClassName }: Props) => {
  return (
    <div className={className}>
      <p className={twMerge("text-xs font-medium text-mineshaft-400", labelClassName)}>{label}</p>
      {children ? (
        <p className="text-sm text-mineshaft-100">{children}</p>
      ) : (
        <p className="text-sm italic text-mineshaft-400/50">None</p>
      )}
    </div>
  );
};
