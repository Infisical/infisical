import { ReactNode } from "react";

import { DetailGroup, DetailGroupHeader } from "@app/components/v3";

type Props = {
  label: "Parameters" | "Secrets Mapping" | "Password Requirements";
  children: ReactNode;
};

export const SecretRotationReviewSection = ({ label, children }: Props) => {
  return (
    <DetailGroup>
      <DetailGroupHeader className="border-b border-border pb-1">{label}</DetailGroupHeader>
      <div className="flex flex-wrap gap-x-8 gap-y-2">{children}</div>
    </DetailGroup>
  );
};
