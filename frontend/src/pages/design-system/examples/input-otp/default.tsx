import * as UI from "@app/components/v4/ui/input-otp";
import { Label } from "@app/components/v4/ui/label";

import { ExampleStack } from "../../example-presentation";

const specimens = [
  {
    id: "verification-code",
    label: "Verification code",
    help: "Enter the six-digit code from your authenticator.",
    disabled: false,
    invalid: false,
    value: undefined
  },
  {
    id: "verification-disabled",
    label: "Verification unavailable",
    help: "Code entry is unavailable while another request is pending.",
    disabled: true,
    invalid: false,
    value: "123456"
  },
  {
    id: "verification-invalid",
    label: "Rejected verification code",
    help: "This preview code was rejected. Enter a new code.",
    disabled: false,
    invalid: true,
    value: "654321"
  }
];
export default function Example() {
  return (
    <ExampleStack>
      {specimens.map((specimen) => (
        <div key={specimen.id} className="space-y-3">
          <Label htmlFor={specimen.id}>{specimen.label}</Label>
          <UI.InputOTP
            id={specimen.id}
            maxLength={6}
            containerClassName="flex-wrap"
            pattern="^[0-9]+$"
            aria-describedby={`${specimen.id}-help`}
            disabled={specimen.disabled}
            aria-invalid={specimen.invalid || undefined}
            defaultValue={specimen.value}
          >
            <UI.InputOTPGroup>
              {[0, 1].map((index) => (
                <UI.InputOTPSlot
                  key={index}
                  index={index}
                  aria-invalid={specimen.invalid || undefined}
                />
              ))}
            </UI.InputOTPGroup>
            <UI.InputOTPSeparator />
            <UI.InputOTPGroup>
              {[2, 3].map((index) => (
                <UI.InputOTPSlot
                  key={index}
                  index={index}
                  aria-invalid={specimen.invalid || undefined}
                />
              ))}
            </UI.InputOTPGroup>
            <UI.InputOTPSeparator />
            <UI.InputOTPGroup>
              {[4, 5].map((index) => (
                <UI.InputOTPSlot
                  key={index}
                  index={index}
                  aria-invalid={specimen.invalid || undefined}
                />
              ))}
            </UI.InputOTPGroup>
          </UI.InputOTP>
          <p id={`${specimen.id}-help`}>{specimen.help}</p>
        </div>
      ))}
    </ExampleStack>
  );
}
