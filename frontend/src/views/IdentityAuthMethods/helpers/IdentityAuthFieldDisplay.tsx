import { ReactNode } from "react";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";

type Props = {
  label: string;
  children: ReactNode;
  className?: string;
};

export const IdentityAuthFieldDisplay = ({ label, children, className }: Props) => {
  return (
    <Detail className={className}>
      <DetailLabel>{label}</DetailLabel>
      <DetailValue>
        {children ? (
          <p className="break-words">{children}</p>
        ) : (
          <p className="text-muted">Not set</p>
        )}
      </DetailValue>
    </Detail>
  );
};
