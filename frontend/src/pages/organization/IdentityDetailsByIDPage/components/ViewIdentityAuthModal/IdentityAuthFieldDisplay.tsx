import { ReactNode } from "react";

type Props = {
  label: string;
  children: ReactNode;
  className?: string;
};

export const IdentityAuthFieldDisplay = ({ label, children, className }: Props) => {
  return (
    <div className={className}>
      <span className="text-mineshaft-400 text-sm">{label}</span>
      {children ? (
        <p className="break-words text-base leading-4">{children}</p>
      ) : (
        <p className="text-bunker-400 text-base italic leading-4">Not set</p>
      )}
    </div>
  );
};
