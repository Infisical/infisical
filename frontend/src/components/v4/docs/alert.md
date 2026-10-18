# Alert

Explain a persistent result or problem next to the affected content.

## Choose this component

Choose Alert for a condition that remains relevant beside the affected content. Use Toast for a recent transient result and AlertDialog before an irreversible action.

## Usage rules

### alert-usage

Owner: alert.

When a connection remains unavailable after a failed attempt.

Do: State which connection failed and offer a retry or recovery action beside the explanation.

Avoid: Show a generic Something went wrong banner at the top of an unrelated page.

Why: The location and named object explain what the action will repair.

Checked by: review only. Look for: Read the notice without its color. It still names the affected connection, current condition and available recovery, with no duplicate result announcement.

Source evidence:
- src/components/v4/ui/alert.tsx
- src/pages/design-system/examples/alert/default.tsx

### alert-condition-and-recovery

Owner: alert.

When an inline condition needs an explanation or recovery action.

Do: Choose info, ok, warn or bad from the actual condition, name the affected resource and give any recovery action a real handler.

Avoid: Use a warning tone for ordinary metadata, repeat the same success in Alert and Toast, or dismiss a blocking condition without another visible explanation.

Why: Persistent notices consume attention and must explain a real condition where it can be acted on.

Checked by: review only. Look for: Compare the notice with the current task state. Its tone, resource name, action and dismissal policy still make sense after failure and recovery.

Source evidence:
- src/components/v4/ui/alert.tsx
- src/pages/design-system/examples/alert/default.tsx

## State guidance

- error: Keep the condition visible until it clears or the owner dismisses it.
- dismissed: Remove the notice only when the owning state records dismissal.

## Presentation rules

Do: Use one notice for one actionable condition.

Avoid: Stack a success banner, success toast and green badge for one save.

Why: Duplicate feedback competes with the task and repeats announcements.

## Import and exports

- src/components/v4/ui/alert.tsx
- src/components/v4/ui/helpers.module.css

Exports: Alert, AlertAction, AlertDescription, AlertTitle, Banner. Source TypeScript defines the API.

## Behavior

- Alert supports tone and dismissal for inline feedback. Banner represents a standing condition above related content.

## Accessibility

- Use readable text with the tone. Dismissal needs a named button and owner-controlled state when the notice can return.

## Use cases

- Use a concise inline condition with a supported tone and only the recovery or dismissal actions that the host can perform.

## Limits

- Dismissal calls onDismiss; the owner removes or restores the notice and performs any recovery action.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- default: example `variants`, visible label "default".
- destructive: example `variants`, visible label "destructive".

### tone

- neutral: example `default`, visible label "neutral".
- info: example `default`, visible label "info".
- ok: example `default`, visible label "ok".
- warn: example `default`, visible label "warn".
- bad: example `default`, visible label "bad".

### actions

- action: example `variants`, visible label "Review configuration".
- dismiss: example `default`, visible label "Connection failed".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Status and recovery

Save this example at `src/pages/design-system/examples/alert/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/alert. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Alert, Banner } from "../../../../components/v4/ui/alert";
export default function Example() {
    const [visible, setVisible] = useState(true);
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Alert title="Rotation is scheduled">The token rotates every 30 days.</Alert>
      </div><figcaption className="text-muted-foreground text-xs">{"neutral"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Alert tone="info" title="Read access only">
          This connection can fetch secrets.
        </Alert>
      </div><figcaption className="text-muted-foreground text-xs">{"info"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Alert tone="ok" title="Connection verified">
          The provider accepted the supplied credentials.
        </Alert>
      </div><figcaption className="text-muted-foreground text-xs">{"ok"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Alert tone="warn" title="Token expires soon">
          Replace the token before it expires in 7 days.
        </Alert>
      </div><figcaption className="text-muted-foreground text-xs">{"warn"}</figcaption></figure>
      {visible && (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Alert tone="bad" title="Connection failed" onDismiss={() => setVisible(false)}>
            The provider rejected the token. Check its access scope and try again.
          </Alert>
        </div><figcaption className="text-muted-foreground text-xs">{"bad"}</figcaption></figure>)}
      <Banner>Production changes require an approval.</Banner>
    </div>);
}
```

### Variants and actions

Save this example at `src/pages/design-system/examples/alert/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/alert, @infisical/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Alert, AlertDescription, AlertTitle } from "../../../../components/v4/ui/alert";
import { Button } from "../../../../components/v4/ui/button";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      {(["default", "destructive"] as const).map((variant) => (<figure key={variant} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
          <Alert variant={variant}>
            <AlertTitle>Connection needs review</AlertTitle>
            <AlertDescription>
              The provider configuration differs from the saved version.
            </AlertDescription>
          </Alert>
        </div><figcaption className="text-muted-foreground text-xs">{variant}</figcaption></figure>))}
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Alert title="Connection needs review" tone="warn" actions={<Button asChild variant="outline">
              <a href="#input">Review configuration</a>
            </Button>}>
          The provider configuration differs from the saved version.
        </Alert>
      </div><figcaption className="text-muted-foreground text-xs">{"Action"}</figcaption></figure>
    </div>);
}
```

### Dismissible banner

Save this example at `src/pages/design-system/examples/alert/banner.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @infisical/alert, @infisical/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Banner } from "../../../../components/v4/ui/alert";
import { Button } from "../../../../components/v4/ui/button";

export default function Example() {
  const [visible, setVisible] = useState(true);
  return visible ? (
    <Banner
      onDismiss={() => setVisible(false)}
      action={
        <Button variant="link" asChild>
          <a href="#rules">Read guidance</a>
        </Button>
      }
    >
      This example uses synthetic values.
    </Banner>
  ) : (
    <Button variant="outline" onClick={() => setVisible(true)}>
      Show banner
    </Button>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#alert and verify the documented interaction.
