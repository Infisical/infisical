import { forwardRef, ReactNode, useRef } from "react";
import { DotLottie, DotLottieReact, Mode } from "@lottiefiles/dotlottie-react";

export type LottieProps = {
  // Kudos to https://itnext.io/react-polymorphic-components-with-typescript-f7ce72ea7af2
  children?: ReactNode;
  icon?: string;
  iconMode?: Mode;
  className?: string;
  isAutoPlay?: boolean;
};

export const Lottie = forwardRef<HTMLDivElement, LottieProps>(
  ({ children, icon, iconMode, isAutoPlay, ...props }, ref): JSX.Element => {
    const iconRef = useRef<DotLottie | null>(null);
    return (
      <div {...props} ref={ref}>
        <DotLottieReact
          dotLottieRefCallback={(el) => {
            iconRef.current = el;
          }}
          mode={iconMode}
          src={`/lotties/${icon}.json`}
          loop={false}
          autoplay={isAutoPlay}
          className="h-full w-full"
        />
        {children}
      </div>
    );
  }
);
