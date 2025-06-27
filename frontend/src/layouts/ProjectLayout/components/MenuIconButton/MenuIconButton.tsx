import { ComponentPropsWithRef, ElementType, useRef } from "react";
import { DotLottie, DotLottieReact } from "@lottiefiles/dotlottie-react";
import { twMerge } from "tailwind-merge";

import { MenuItemProps } from "@app/components/v2";

export const MenuIconButton = <T extends ElementType = "button">({
  children,
  icon,
  className,
  isDisabled,
  isSelected,
  as: Item = "div",
  description,
  // wrapping in forward ref with generic component causes the loss of ts definitions on props
  inputRef,
  lottieIconMode = "forward",
  ...props
}: MenuItemProps<T> &
  ComponentPropsWithRef<T> & { lottieIconMode?: "reverse" | "forward" }): JSX.Element => {
  const iconRef = useRef<DotLottie | null>(null);
  return (
    <div>
      <Item
        type="button"
        role="menuitem"
        className={twMerge(
          "group relative flex w-full cursor-pointer flex-col items-center justify-center p-2 font-inter text-sm text-bunker-100 transition-all duration-150 hover:bg-mineshaft-700",
          isSelected && "rounded-none bg-bunker-800 hover:bg-mineshaft-600",
          isDisabled && "cursor-not-allowed hover:bg-transparent",
          className
        )}
        onMouseEnter={() => iconRef.current?.play()}
        onMouseLeave={() => iconRef.current?.stop()}
        ref={inputRef}
        {...props}
      >
        <div
          className={`${
            isSelected ? "opacity-100" : "opacity-0"
          } absolute left-0 h-full w-0.5 bg-primary transition-all duration-150`}
        />
        {icon && (
          <div className="my-auto mb-2 h-6 w-6">
            <DotLottieReact
              dotLottieRefCallback={(el) => {
                iconRef.current = el;
              }}
              src={`/lotties/${icon}.json`}
              loop
              className="h-full w-full"
              mode={lottieIconMode}
            />
          </div>
        )}
        <div
          className="flex-grow justify-center break-words text-center"
          style={{ fontSize: "10px" }}
        >
          {children}
        </div>
      </Item>
    </div>
  );
};
