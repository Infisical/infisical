import { Loader } from "../../generic/Loader";
import { cn } from "../../utils";

type PageLoaderProps = {
  lottieClassName?: string;
  text?: string;
};

export function PageLoader({ lottieClassName, text }: PageLoaderProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <Loader className={cn("w-24", lottieClassName)} label={text || undefined} />
      {text && (
        <p aria-hidden="true" className="text-sm text-muted">
          {text}
        </p>
      )}
    </div>
  );
}
