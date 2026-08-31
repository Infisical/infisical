import { type ComponentProps, useRef } from "react";
import { type DotLottie, DotLottieReact } from "@lottiefiles/dotlottie-react";

import { cn } from "../../utils";

type LoaderVariant = "default" | "inverse" | "brand";

type LoaderSize = "xs" | "sm" | "md" | "lg";

type LoaderProps = Omit<ComponentProps<"div">, "children"> & {
  label?: string;
  size?: LoaderSize;
  variant?: LoaderVariant;
};

const animationSources: Record<LoaderVariant, string> = {
  default: "/lotties/infisical_loading_white.json",
  inverse: "/lotties/infisical_loading_bw.json",
  brand: "/lotties/infisical_loading.json"
};

// The mark is 1.91:1 rather than square, so the scale is expressed as widths and
// the height follows the asset's aspect ratio.
const sizeStyles: Record<LoaderSize, string> = {
  xs: "w-5",
  sm: "w-8",
  md: "w-16",
  lg: "w-32"
};

function Loader({
  className,
  label = "Loading",
  size = "md",
  variant = "default",
  ...props
}: LoaderProps) {
  const animationRef = useRef<DotLottie | null>(null);

  return (
    <div
      role="status"
      aria-label={label}
      data-slot="loader"
      data-variant={variant}
      data-size={size}
      // Hover play/stop belongs to the shared Lottie wrapper every branded loader
      // was built on; kept so pointer behavior is unchanged for existing usages.
      onMouseEnter={() => animationRef.current?.play()}
      onMouseLeave={() => animationRef.current?.stop()}
      className={cn(sizeStyles[size], className)}
      {...props}
    >
      <DotLottieReact
        dotLottieRefCallback={(instance) => {
          animationRef.current = instance;
        }}
        src={animationSources[variant]}
        loop
        autoplay
        className="h-full w-full"
      />
    </div>
  );
}

export { Loader, type LoaderProps, type LoaderSize, type LoaderVariant };
