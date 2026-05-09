import { twMerge } from "tailwind-merge";

import { Lottie } from "@app/components/v2/Lottie";

type PageLoaderProps = {
  lottieClassName?: string;
};

export function PageLoader({ lottieClassName }: PageLoaderProps) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Lottie icon="infisical_loading" isAutoPlay className={twMerge("w-24", lottieClassName)} />
    </div>
  );
}
