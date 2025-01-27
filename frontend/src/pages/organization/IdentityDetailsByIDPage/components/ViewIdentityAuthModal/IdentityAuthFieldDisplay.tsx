import { ReactNode } from "react";

type Props = {
  label: string;
  children: ReactNode;
  className?: string;
};

export const IdentityAuthFieldDisplay = ({ label, children, className }: Props) => {
  return (
    <div className={className}>
      <span className="text-sm text-mineshaft-400">{label}</span>
      {children ? (
        <p className="break-words text-base leading-4">{children}</p>
      ) : (
        <p className="text-base italic leading-4 text-bunker-400">Not set</p>
      )}
    </div>
  );
};
