import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";

import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { Icon } from "./icon";

import controlStyles from "./controls.module.css";

function InputOTP({
  className,
  containerClassName,
  value,
  defaultValue,
  onChange,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof OTPInput> & {
  containerClassName?: string;
} & { ref?: React.Ref<React.ComponentRef<typeof OTPInput>> }) {
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
}
InputOTP.displayName = "InputOTP";

function InputOTPGroup({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="input-otp-group"
      className={cn(controlStyles.otpGroup, className)}
      {...props}
    />
  );
}
InputOTPGroup.displayName = "InputOTPGroup";

function InputOTPSlot({
  index,
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  index: number;
} & { ref?: React.Ref<React.ComponentRef<"div">> }) {
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
}
InputOTPSlot.displayName = "InputOTPSlot";

function InputOTPSeparator({ ref, ...props }: React.ComponentProps<"div">) {
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
}
InputOTPSeparator.displayName = "InputOTPSeparator";

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot };
