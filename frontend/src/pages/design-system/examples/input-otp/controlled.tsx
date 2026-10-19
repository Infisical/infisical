import { useState } from "react";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot
} from "@app/components/v4/ui/input-otp";
import { Label } from "@app/components/v4/ui/label";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [value, setValue] = useState("");
  const [completed, setCompleted] = useState("");
  return (
    <ExampleCell label="Alphanumeric recovery code">
      <Label htmlFor="alphanumeric-code">Recovery code</Label>
      <InputOTP
        id="alphanumeric-code"
        maxLength={4}
        pattern="^[A-Z0-9]+$"
        inputMode="text"
        value={value}
        onChange={(next) => {
          setValue(next);
          setCompleted("");
        }}
        onComplete={setCompleted}
        pasteTransformer={(text) => text.replaceAll("-", "").toUpperCase()}
        containerClassName="flex-wrap"
      >
        <InputOTPGroup>
          {[0, 1].map((index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          {[2, 3].map((index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <p className="text-sm">Letters A to Z and digits 0 to 9.</p>
      <p role="status" className="sr-only text-sm">
        {completed ? `Local code complete: ${completed}` : `${value.length} of 4 characters`}
      </p>
    </ExampleCell>
  );
}
