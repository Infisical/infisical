import { ReactNode } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { twMerge } from "tailwind-merge";

export type SwitchProps = Omit<SwitchPrimitive.SwitchProps, "checked" | "disabled" | "required"> & {
  children?: ReactNode;
  id: string;
  isChecked?: boolean;
  isRequired?: boolean;
  isDisabled?: boolean;
  containerClassName?: string;
  thumbClassName?: string;
};

export const Switch = ({
  children,
  id,
  className,
  isChecked,
  isDisabled,
  isRequired,
  containerClassName,
  thumbClassName,
  ...props
}: SwitchProps): JSX.Element => (
  <div className={twMerge("font-inter text-bunker-300 flex items-center", containerClassName)}>
    <label className="text-sm" htmlFor={id}>
      {children}
      {isRequired && <span className="text-red pl-1">*</span>}
    </label>
    <SwitchPrimitive.Root
      {...props}
      required={isRequired}
      checked={isChecked}
      disabled={isDisabled}
      className={twMerge(
        "bg-bunker-300 data-[state=checked]:bg-primary ml-3 h-5 w-9 rounded-full transition-all",
        isDisabled && "bg-bunker-400 hover:bg-bunker-400",
        className
      )}
      id={id}
    >
      <SwitchPrimitive.Thumb
        className={twMerge(
          "block h-4 w-4 translate-x-0.5 rounded-full border-none bg-black shadow-sm transition-all will-change-transform data-[state=checked]:translate-x-[18px]",
          thumbClassName
        )}
      />
    </SwitchPrimitive.Root>
  </div>
);
