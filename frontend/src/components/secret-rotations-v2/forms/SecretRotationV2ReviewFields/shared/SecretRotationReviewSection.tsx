import { ReactNode } from "react";

type Props = {
  label: "Parameters" | "Secrets Mapping" | "Password Requirements";
  children: ReactNode;
};

export const SecretRotationReviewSection = ({ label, children }: Props) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="border-mineshaft-600 w-full border-b">
        <span className="text-mineshaft-300 text-sm">{label}</span>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">{children}</div>
    </div>
  );
};
