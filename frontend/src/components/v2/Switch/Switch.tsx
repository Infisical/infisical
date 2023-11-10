import { ReactNode } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { twMerge } from "tailwind-merge";

export type SwitchProps = Omit<SwitchPrimitive.SwitchProps, "checked" | "disabled" | "required"> & {
  children?: ReactNode;
  id: string;
  isChecked?: boolean;
  isRequired?: boolean;
  isDisabled?: boolean;
};

export const Switch = ({
  children,
  id,
  className,
  isChecked,
  isDisabled,
  isRequired,
  ...props
}: SwitchProps): JSX.Element => (
  <div className="flex items-center font-inter text-bunker-300">
    <label className="text-sm" htmlFor={id}>
      {children}
      {isRequired && <span className="pl-1 text-red">*</span>}
    </label>
    <SwitchPrimitive.Root
      {...props}
      required={isRequired}
      checked={isChecked}
      disabled={isDisabled}
      className={twMerge(
        "ml-3 h-5 w-9 rounded-full bg-bunker-300 transition-all data-[state=checked]:bg-primary",
        isDisabled && "bg-bunker-400 hover:bg-bunker-400",
        className
      )}
      id={id}
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full border-none bg-black shadow transition-all will-change-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  </div>
);
