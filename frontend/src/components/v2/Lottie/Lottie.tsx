import { forwardRef, ReactNode } from "react";
import { DotLottieReact, Mode } from "@lottiefiles/dotlottie-react";

export type LottieProps = {
  // Kudos to https://itnext.io/react-polymorphic-components-with-typescript-f7ce72ea7af2
  children?: ReactNode;
  icon?: string;
  iconMode?: Mode;
  className?: string;
  isAutoPlay?: boolean;
};

// The onMouseEnter/onMouseLeave play/stop handlers were removed: this component's
// only consumer is the router's indeterminate page loader, and an indeterminate
// loader must not stop while the wait continues (stop() resets to frame 0, a fully
// drawn mark that reads as a hung app until the pointer re-enters).
// Hover-to-play icons inline their own DotLottieReact player instead.
export const Lottie = forwardRef<HTMLDivElement, LottieProps>(
  ({ children, icon, iconMode, isAutoPlay, ...props }, ref): JSX.Element => {
    return (
      <div {...props} ref={ref}>
        <DotLottieReact
          mode={iconMode}
          src={`/lotties/${icon}.json`}
          loop
          autoplay={isAutoPlay}
          className="h-full w-full"
        />
        {children}
      </div>
    );
  }
);
