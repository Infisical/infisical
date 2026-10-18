# Input OTP

Enter a fixed-length verification code in connected slots.

## Choose this component

Choose InputOTP for a short verification code with a known pattern and length. Use Input for arbitrary tokens or long recovery strings.

## Usage rules

### input-otp-usage

Owner: input-otp.

When the last slot becomes filled.

Do: Keep the code as one string and let the host verify it before announcing authentication success.

Avoid: Store each slot separately or equate reaching maxLength with a verified code.

Why: A complete code can still be wrong, expired or rejected by the server.

Checked by: review only. Look for: Paste a complete code, delete to a partial code and reject verification; one string stays editable and filling the final slot does not announce authentication success.

Source evidence:
- src/components/v4/ui/input-otp.tsx
- src/pages/design-system/examples/input-otp/default.tsx

### input-otp-code-entry-not-verification

Owner: input-otp.

When a verification form accepts a fixed-length code.

Do: Set the accepted pattern and length deliberately, allow paste through the supported transformer and let the host verify and rate-limit submissions.

Avoid: Assume inputMode enforces digits or show Verified when onComplete only means every slot is filled.

Why: Completing an entry is different from a server accepting the code.

Checked by: review only. Look for: Paste valid and invalid characters, fill the final slot and reject verification. The entry contract holds and completion never reports authentication success by itself.

Source evidence:
- src/components/v4/ui/input-otp.tsx
- src/pages/design-system/examples/input-otp/default.tsx

## State guidance

- partial: Allow empty and intermediate values so deletion and paste remain usable.
- rejected: Keep a clear verification error and explain whether the person should retry or request a new code.

## Presentation rules

Do: Use separators only where the issued code has meaningful groups.

Avoid: Style each slot like a separate form with its own label and error.

Why: The code is one value and should behave like one editing target.

Do: Keep the slot count consistent with maxLength and show partial, complete and rejected local values.

Avoid: Treat completion as successful authentication or present different slot groupings as named sizes.

Why: Completion reports a whole local value; verification and persistence belong to the host.

## Import and exports

- src/components/v4/ui/input-otp.tsx

Exports: InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot. Source TypeScript defines the API.

## Behavior

- One underlying input owns the whole string; onChange receives that string, including partial and empty values. maxLength defines completion; onComplete signals length completion, not successful verification.

## Accessibility

- Put id, label and error associations on InputOTP's real input. Slots display characters and focus position; they are not separate inputs. Paste and one-time-code autofill use that whole input.

## Use cases

- Keep a code as one string. Configure its accepted characters and length before connecting completion to host verification.

## Limits

- inputMode only suggests a keyboard; set pattern for numeric or alphanumeric codes explicitly. The library defaults autocomplete to one-time-code and supports pasteTransformer; the host owns verification, retries and rate limits.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### state

- numeric: example `default`, visible label "Verification code".
- disabled: example `default`, visible label "Verification unavailable".
- invalid: example `default`, visible label "Rejected verification code".
- controlled: example `controlled`, visible label "Recovery code".
- completion: example `controlled`, visible label "Local code complete:".
- alphanumeric paste: example `controlled`, visible label "Recovery code".

## Executable examples

### Numeric code states

Save this example at `src/pages/design-system/examples/input-otp/default.tsx`; its relative imports are generated for that exact path. States: default, disabled, invalid.

Registry items used: @infisical/input-otp, @infisical/label. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as UI from "../../../../components/v4/ui/input-otp";
import { Label } from "../../../../components/v4/ui/label";
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
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      {specimens.map((specimen) => (<div key={specimen.id} className="space-y-3">
          <Label htmlFor={specimen.id}>{specimen.label}</Label>
          <UI.InputOTP id={specimen.id} maxLength={6} containerClassName="flex-wrap" pattern="^[0-9]+$" aria-describedby={`${specimen.id}-help`} disabled={specimen.disabled} aria-invalid={specimen.invalid || undefined} defaultValue={specimen.value}>
            <UI.InputOTPGroup>
              {[0, 1].map((index) => (<UI.InputOTPSlot key={index} index={index} aria-invalid={specimen.invalid || undefined}/>))}
            </UI.InputOTPGroup>
            <UI.InputOTPSeparator />
            <UI.InputOTPGroup>
              {[2, 3].map((index) => (<UI.InputOTPSlot key={index} index={index} aria-invalid={specimen.invalid || undefined}/>))}
            </UI.InputOTPGroup>
            <UI.InputOTPSeparator />
            <UI.InputOTPGroup>
              {[4, 5].map((index) => (<UI.InputOTPSlot key={index} index={index} aria-invalid={specimen.invalid || undefined}/>))}
            </UI.InputOTPGroup>
          </UI.InputOTP>
          <p id={`${specimen.id}-help`}>{specimen.help}</p>
        </div>))}
    </div>);
}
```

### Controlled recovery code

Save this example at `src/pages/design-system/examples/input-otp/controlled.tsx`; its relative imports are generated for that exact path. States: controlled, keyboard, success.

Registry items used: @infisical/input-otp, @infisical/label. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "../../../../components/v4/ui/input-otp";
import { Label } from "../../../../components/v4/ui/label";
export default function Example() {
    const [value, setValue] = useState("");
    const [completed, setCompleted] = useState("");
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
      <Label htmlFor="alphanumeric-code">Recovery code</Label>
      <InputOTP id="alphanumeric-code" maxLength={4} pattern="^[A-Z0-9]+$" inputMode="text" value={value} onChange={(next) => {
            setValue(next);
            setCompleted("");
        }} onComplete={setCompleted} pasteTransformer={(text) => text.replaceAll("-", "").toUpperCase()} containerClassName="flex-wrap">
        <InputOTPGroup>
          {[0, 1].map((index) => (<InputOTPSlot key={index} index={index}/>))}
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          {[2, 3].map((index) => (<InputOTPSlot key={index} index={index}/>))}
        </InputOTPGroup>
      </InputOTP>
      <p className="text-sm">Letters A to Z and digits 0 to 9.</p>
      <p role="status" className="sr-only text-sm">
        {completed ? `Local code complete: ${completed}` : `${value.length} of 4 characters`}
      </p>
    </div><figcaption className="text-muted-foreground text-xs">{"Alphanumeric recovery code"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#input-otp and verify the documented interaction.
