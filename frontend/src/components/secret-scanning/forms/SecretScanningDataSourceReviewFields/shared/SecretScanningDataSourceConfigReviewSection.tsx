import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export const SecretScanningDataSourceConfigReviewSection = ({ children }: Props) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="w-full border-b border-mineshaft-600">
        <span className="text-sm text-mineshaft-300">Configuration</span>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">{children}</div>
    </div>
  );
};
