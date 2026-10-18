# Accordion

Reveal related sections without leaving the current context.

## Choose this component

Choose Accordion for several independently useful disclosure sections. Use Collapsible for one optional region and Tabs for peer views.

## Usage rules

### accordion-usage

Owner: accordion.

When a collapsed section contains invalid fields.

Do: Give each heading a distinct content name, reveal invalid content after submission and keep essential task instructions outside collapsed sections.

Avoid: Hide the only error explanation behind a closed Advanced panel.

Why: People cannot repair a hidden field or complete a task from headings that conceal the instructions most of them need.

Checked by: review only. Look for: Submit invalid content inside a closed item; the item opens, its named heading remains locatable and the invalid field can receive focus.

Source evidence:
- src/components/v4/ui/accordion.tsx
- src/pages/design-system/examples/accordion/default.tsx

## State guidance

- single/multiple: Choose single for one open section or multiple when users compare sections.
- invalid: Reveal invalid content and move focus to its field after submission.

## Presentation rules

Do: Write headings that identify the hidden content.

Avoid: Use a stack of identical More details headings.

Why: Repeated headings make scanning and keyboard navigation ambiguous.

## Import and exports

- src/components/v4/ui/accordion.tsx

Exports: Accordion, AccordionContent, AccordionItem, AccordionTrigger. Source TypeScript defines the API.

## Behavior

- Radix single mode uses a string value; multiple mode uses an array. onValueChange reports item values, and collapsible allows the open single item to close.

## Accessibility

- Each trigger is a button inside a heading and controls its own panel. Arrow keys, Home and End move between triggers.

## Use cases

- Use stable item values and choose single or multiple mode from whether simultaneous reading is useful; allow long trigger text to wrap.

## Avoid

- Encode required form choices in open sections or hide an unresolved validation error only inside a closed panel.

## Limits

- Disclosure does not persist a setting or validate its contents; the host owns those operations.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### root type

- single: example `variants`, visible label "Single, noncollapsible".
- multiple: example `variants`, visible label "Multiple, both open".

### orientation


- vertical: omitted. Changes arrow-key direction only, nothing visible.
- horizontal: omitted. Changes arrow-key direction only, nothing visible.

### disabled

- false: example `default`, visible label "Retention policy".
- true: example `default`, visible label "Organization policy".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Connection settings

Save this example at `src/pages/design-system/examples/accordion/default.tsx`; its relative imports are generated for that exact path. States: default, disabled.

Registry items used: @infisical/accordion. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as UI from "../../../../components/v4/ui/accordion";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <UI.Accordion type="single" collapsible>
        <UI.AccordionItem value="retention">
          <UI.AccordionTrigger>Retention policy</UI.AccordionTrigger>
          <UI.AccordionContent>Versions remain available for 30 days.</UI.AccordionContent>
        </UI.AccordionItem>
        <UI.AccordionItem value="locked" disabled>
          <UI.AccordionTrigger>Organization policy</UI.AccordionTrigger>
          <UI.AccordionContent>Managed by administrators.</UI.AccordionContent>
        </UI.AccordionItem>
      </UI.Accordion>
    </div>);
}
```

### Variants

Save this example at `src/pages/design-system/examples/accordion/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/accordion. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../../../components/v4/ui/accordion";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Accordion type="single" defaultValue="versions">
          <AccordionItem value="versions">
            <AccordionTrigger>Version retention</AccordionTrigger>
            <AccordionContent>Versions remain available for 30 days.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="policy">
            <AccordionTrigger>Access policy</AccordionTrigger>
            <AccordionContent>Read access expires after one hour.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </div><figcaption className="text-muted-foreground text-xs">{"Single, noncollapsible"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Accordion type="multiple" defaultValue={["versions", "policy"]}>
          {["versions", "policy"].map((value) => (<AccordionItem key={value} value={value}>
              <AccordionTrigger>
                {value === "versions" ? "Version retention" : "Access policy"}
              </AccordionTrigger>
              <AccordionContent>
                {value === "versions"
                ? "Versions remain available for 30 days."
                : "Read access expires after one hour."}
              </AccordionContent>
            </AccordionItem>))}
        </Accordion>
      </div><figcaption className="text-muted-foreground text-xs">{"Multiple, both open"}</figcaption></figure>
    </div>);
}
```

### Controlled open section

Save this example at `src/pages/design-system/examples/accordion/controlled.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @infisical/accordion. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../../../components/v4/ui/accordion";
export default function Example() {
    const [open, setOpen] = useState("versions");
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <Accordion type="single" value={open} onValueChange={setOpen} collapsible>
        {["versions", "policy"].map((value) => (<AccordionItem key={value} value={value}>
            <AccordionTrigger>
              {value === "versions" ? "Version retention" : "Access policy"}
            </AccordionTrigger>
            <AccordionContent>Managed by project settings.</AccordionContent>
          </AccordionItem>))}
      </Accordion>
      <p role="status" className="sr-only">
        {open ? `Open section: ${open}` : "All sections closed"}
      </p>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#accordion and verify the documented interaction.
