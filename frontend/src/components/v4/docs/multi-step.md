# Multi step

A task in steps where each step checks its fields before the next, in a dialog, a sheet or the page.

## Choose this component

Choose MultiStep for ordered, validated steps. Use Tabs for sections in any order and a Dialog with sections for two steps.

## Usage rules

### multi-step-validate

Owner: multi-step.

When a step has required fields.

Do: Return false from validate after setting field errors, so focus moves to the first invalid field.

Avoid: Advance and report every error on the review step.

Why: Errors are easiest to fix where the value was entered.

Checked by: review only. Look for: Press Continue with an empty team slug and check that focus lands on the field.

Source evidence:
- src/components/v4/ui/multi-step.tsx
- src/pages/design-system/examples/multi-step/default.tsx

### multi-step-complete-label

Owner: multi-step.

When the last step runs the task.

Do: Name the action in completeLabel, such as Connect or Import 4 secrets.

Avoid: Leave the primary as Finish or Submit.

Why: The last button commits the task, so it should say what happens.

Checked by: review only. Look for: Read the primary label on the last step.

Source evidence:
- src/pages/design-system/examples/multi-step/default.tsx

## State guidance

- invalid: The step stays and focus moves to the first invalid field.
- busy: Continue shows its loading state while validate or onComplete runs.

## Presentation rules

Do: Title steps with nouns, such as Team and Review.

Avoid: Write steps as sentences or number them in the title.

Why: The indicator already numbers them.

## Import and exports

- src/components/v4/ui/multi-step.tsx
- src/components/v4/ui/multi-step.module.css

Exports: MultiStep, Steps. Source TypeScript defines the API.

## Behavior

- Each step slides in from the direction of travel while its box eases to the new height; reduced motion jumps.
- validate returns true or nothing to continue, false to stay and focus the first invalid field, or a message for the footer. A promise keeps Continue busy.
- onComplete runs after the last step validates. A rejection shows its message in the footer.
- Moving to a step focuses its first field, and Enter in a text field continues.
- The page variant shows a vertical step list beside a card; under 640px the list becomes the step bar above the card.

## Accessibility

- The horizontal indicator is a progressbar with Step 2 of 3 as its value text; the vertical list marks the current step with aria-current.
- In the vertical list, earlier steps are buttons that go back to them. Moving forward always runs the step's validate, and the horizontal indicator is not interactive.

## Use cases

- Use MultiStep for three to five ordered steps where later steps depend on earlier ones, ending with a review that names the action.

## Avoid

- Use it for sections people visit in any order, or for a two-step task.

## Limits

- The dialog opens in place; it does not grow out of its trigger.
- The host owns field values, so values survive going back.
- The dialog and sheet cannot be dismissed while a step is checking; closing them calls onCancel and returns to the first step.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- dialog: example `default`, visible label "dialog".
- sheet: example `default`, visible label "sheet".
- page: example `default`, visible label "page".

## Executable examples

### Connect an integration in three containers

Save this example at `src/pages/design-system/examples/multi-step/default.tsx`; its relative imports are generated for that exact path. States: default, invalid, controlled, keyboard.

Registry items used: @infisical/button, @infisical/checkbox, @infisical/field, @infisical/input, @infisical/multi-step. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import { Checkbox } from "../../../../components/v4/ui/checkbox";
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
import { MultiStep } from "../../../../components/v4/ui/multi-step";
const useConnection = () => {
    const [team, setTeam] = useState("");
    const [teamError, setTeamError] = useState(false);
    const [preview, setPreview] = useState(true);
    return [
        {
            title: "Team",
            heading: "Pick the Vercel team",
            description: "Infisical syncs secrets into this team's projects.",
            summary: team || undefined,
            validate: () => {
                setTeamError(!team.trim());
                return Boolean(team.trim());
            },
            content: (<Field label="Team slug" error={teamError ? "Enter the team slug." : undefined}>
          <Input value={team} aria-invalid={teamError || undefined} onChange={(event) => setTeam(event.target.value)} placeholder="acme"/>
        </Field>)
        },
        {
            title: "Environments",
            heading: "Choose environments",
            description: "Production always syncs.",
            content: (<Field label="Also sync preview deployments" orientation="horizontal">
          <Checkbox checked={preview} onCheckedChange={(value) => setPreview(value === true)}/>
        </Field>)
        },
        {
            title: "Review",
            heading: "Review the connection",
            description: `Connects ${team || "your team"} and syncs ${preview ? "2" : "1"} environments.`,
            content: <p>Nothing is saved until you connect.</p>
        }
    ];
};
const Connect = ({ variant, trigger, onDone }: {
    variant: "dialog" | "sheet" | "page";
    trigger?: React.ReactElement;
    onDone: () => void;
}) => (<MultiStep variant={variant} title="Connect Vercel" steps={useConnection()} completeLabel="Connect" onComplete={onDone} trigger={trigger}/>);
export default function Example() {
    const [done, setDone] = useState("");
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Connect variant="dialog" onDone={() => setDone("Vercel connected from the dialog.")} trigger={<Button variant="outline">Connect Vercel</Button>}/>
      </div><figcaption className="text-muted-foreground text-xs">{"dialog"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Connect variant="sheet" onDone={() => setDone("Vercel connected from the sheet.")} trigger={<Button variant="outline">Open in a sheet</Button>}/>
      </div><figcaption className="text-muted-foreground text-xs">{"sheet"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Connect variant="page" onDone={() => setDone("Vercel connected from the page.")}/>
        {done && <p role="status">{done}</p>}
      </div><figcaption className="text-muted-foreground text-xs">{"page"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#multi-step and exercise the documented interaction.
