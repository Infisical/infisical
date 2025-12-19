import { Lottie } from "@app/components/v2";

export function UnstablePageLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Lottie icon="infisical_loading" isAutoPlay className="w-24" />
    </div>
  );
}
