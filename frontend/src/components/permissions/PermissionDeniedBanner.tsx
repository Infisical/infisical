import { twMerge } from "tailwind-merge";

import { AccessRestrictedBanner } from "@app/components/v2";

type Props = {
  containerClassName?: string;
};

export const PermissionDeniedBanner = ({ containerClassName }: Props) => {
  return (
    <div
      className={twMerge(
        "container mx-auto flex h-full items-center justify-center",
        containerClassName
      )}
    >
      <AccessRestrictedBanner />
    </div>
  );
};
