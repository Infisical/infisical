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
        <p className="text-base leading-4 break-words">{children}</p>
      ) : (
        <p className="text-base leading-4 text-bunker-400 italic">Not set</p>
      )}
    </div>
  );
};
