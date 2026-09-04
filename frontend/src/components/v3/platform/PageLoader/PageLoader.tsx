import { Loader } from "../../generic/Loader";
import { cn } from "../../utils";

type PageLoaderProps = {
  lottieClassName?: string;
};

export function PageLoader({ lottieClassName }: PageLoaderProps) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader className={cn("w-24", lottieClassName)} />
    </div>
  );
}
