import { ReactNode } from "react";

import { DetailGroup, DetailGroupHeader } from "@app/components/v3";

type Props = {
  children: ReactNode;
};

export const SecretScanningDataSourceConfigReviewSection = ({ children }: Props) => {
  return (
    <DetailGroup>
      <DetailGroupHeader>Configuration</DetailGroupHeader>
      <div className="flex flex-wrap gap-x-8 gap-y-2">{children}</div>
    </DetailGroup>
  );
};
