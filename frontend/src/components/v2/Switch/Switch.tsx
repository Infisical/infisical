import { ReactNode } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { twMerge } from 'tailwind-merge';

export type SwitchProps = Omit<SwitchPrimitive.SwitchProps, 'checked' | 'disabled' | 'required'> & {
  children: ReactNode;
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
  <div className="flex items-center text-bunker-300 font-inter">
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
        'h-5 ml-3 transition-all rounded-full w-9 bg-bunker-300 data-[state=checked]:bg-bunker-200',
        isDisabled && 'bg-bunker-400 hover:bg-bunker-400',
        className
      )}
      id={id}
    >
      <SwitchPrimitive.Thumb className="w-4 h-4 border-none will-change-transform rounded-full shadow bg-black block transition-all translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  </div>
);
