import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";

import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { Icon } from "./icon";

import controlStyles from "./controls.module.css";

const InputOTP = React.forwardRef<
  React.ComponentRef<typeof OTPInput>,
  React.ComponentPropsWithoutRef<typeof OTPInput> & {
    containerClassName?: string;
  }
>(({ className, containerClassName, value, defaultValue, onChange, ...props }, ref) => {
  const [current, setCurrent] = useControllableState({
    value,
    defaultValue: typeof defaultValue === "string" ? defaultValue : "",
    onChange
  });
  return (
    <OTPInput
      ref={ref}
      data-slot="input-otp"
      containerClassName={cn(controlStyles.otp, containerClassName)}
      spellCheck={false}
      value={current}
      onChange={setCurrent}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
});
InputOTP.displayName = "InputOTP";

const InputOTPGroup = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="input-otp-group"
      className={cn(controlStyles.otpGroup, className)}
      {...props}
    />
  );
});
InputOTPGroup.displayName = "InputOTPGroup";

const InputOTPSlot = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & {
    index: number;
  }
>(({ index, className, ...props }, ref) => {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};

  return (
    <div
      ref={ref}
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(controlStyles.otpSlot, controlStyles.technical, className)}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className={controlStyles.otpCaretBox}>
          <div className={controlStyles.otpCaret} />
        </div>
      )}
    </div>
  );
});
InputOTPSlot.displayName = "InputOTPSlot";

const InputOTPSeparator = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ ...props }, ref) => {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-slot="input-otp-separator"
      className={controlStyles.otpSeparator}
      role="separator"
      {...props}
    >
      <Icon name="minus" size={16} />
    </div>
  );
});
InputOTPSeparator.displayName = "InputOTPSeparator";

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot };
