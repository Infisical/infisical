import { type ComponentProps, useEffect, useRef, useSyncExternalStore } from "react";
import { type DotLottie, DotLottieReact } from "@lottiefiles/dotlottie-react";

import { cn } from "../../utils";

type LoaderVariant = "brand" | "inverse";

type LoaderSize = "xs" | "sm" | "md" | "lg";

type LoaderProps = Omit<ComponentProps<"div">, "children"> & {
  label?: string;
  size?: LoaderSize;
  variant?: LoaderVariant;
};

const animationSources: Record<LoaderVariant, string> = {
  brand: "/lotties/infisical_loading.json",
  inverse: "/lotties/infisical_loading_bw.json"
};

// The mark is 1.91:1 rather than square, so the scale is expressed as widths and
// the height follows the asset's aspect ratio.
const sizeStyles: Record<LoaderSize, string> = {
  xs: "w-5",
  sm: "w-8",
  md: "w-16",
  lg: "w-32"
};

const subscribeToReducedMotion = (onChange: () => void) => {
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
};

function Loader({
  className,
  label = "Loading",
  size = "md",
  variant = "brand",
  ...props
}: LoaderProps) {
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
  const animationRef = useRef<DotLottie | null>(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      animationRef.current?.stop();
    } else {
      animationRef.current?.play();
    }
  }, [prefersReducedMotion]);

  return (
    <div
      role="status"
      aria-label={label}
      data-slot="loader"
      className={cn(sizeStyles[size], className)}
      {...props}
    >
      {/* The reduced-motion state intentionally stops at the fully drawn first frame,
          preserving the loading indicator without continuous animation. */}
      <DotLottieReact
        dotLottieRefCallback={(animation) => {
          animationRef.current = animation;
          if (prefersReducedMotion) {
            animation?.stop();
          }
        }}
        src={animationSources[variant]}
        loop
        autoplay={!prefersReducedMotion}
        className="h-full w-full"
      />
    </div>
  );
}

export { Loader, type LoaderProps, type LoaderSize, type LoaderVariant };
