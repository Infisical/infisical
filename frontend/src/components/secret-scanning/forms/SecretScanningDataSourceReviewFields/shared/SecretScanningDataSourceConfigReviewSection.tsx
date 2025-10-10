import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export const SecretScanningDataSourceConfigReviewSection = ({ children }: Props) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="border-mineshaft-600 w-full border-b">
        <span className="text-mineshaft-300 text-sm">Configuration</span>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">{children}</div>
    </div>
  );
};
