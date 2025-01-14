import { ComponentPropsWithRef, ElementType, useRef } from "react";
import { DotLottie, DotLottieReact } from "@lottiefiles/dotlottie-react";

import { MenuItemProps } from "@app/components/v2";
import { twMerge } from "tailwind-merge";

export const MenuIconButton = <T extends ElementType = "button">({
  children,
  icon,
  className,
  isDisabled,
  isSelected,
  as: Item = "button",
  description,
  // wrapping in forward ref with generic component causes the loss of ts definitions on props
  inputRef,
  ...props
}: MenuItemProps<T> & ComponentPropsWithRef<T>): JSX.Element => {
  const iconRef = useRef<DotLottie | null>(null);
  return (
    <Item
      type="button"
      role="menuitem"
      className={twMerge(
        "duration-50 group relative flex w-full cursor-pointer flex-col items-center justify-center rounded p-2 font-inter text-sm text-bunker-100 transition-all hover:bg-mineshaft-700",
        isSelected && "bg-bunker-800 hover:bg-mineshaft-600",
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
          isSelected ? "visisble" : "invisible"
        } absolute -left-[0.28rem] h-full w-[0.07rem] rounded-md bg-primary`}
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
          />
        </div>
      )}
      <span className="flex-grow break-words text-center text-xxs">{children}</span>
    </Item>
  );
};
