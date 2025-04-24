import { ReactNode } from "react";

type Props = {
  label: "Parameters" | "Secrets Mapping";
  children: ReactNode;
};

export const SecretRotationReviewSection = ({ label, children }: Props) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="w-full border-b border-mineshaft-600">
        <span className="text-sm text-mineshaft-300">{label}</span>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">{children}</div>
    </div>
  );
};
