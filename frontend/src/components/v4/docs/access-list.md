# Access list

Who can reach a project: a member per row that opens them, multiple selection with the bulk bar and a locked owner.

## Choose this component

Choose AccessList for a membership list with bulk changes. Use a Table when people need to sort, filter or export members.

## Usage rules

### access-list-roles

Owner: access-list.

When a member has a role or temporary access.

Do: Name the role in a Badge and say when temporary access ends, such as Read, 1 hour.

Avoid: Color-code roles or hide the expiry in a tooltip.

Why: Words survive both themes and screen readers; color alone does not.

Checked by: review only. Look for: Read each row's badge and description for the role and any expiry.

Source evidence:
- src/components/v4/patterns/access-list.tsx
- src/pages/design-system/examples/access-list/default.tsx

### access-list-owner

Owner: access-list.

When a member cannot lose access, such as the owner.

Do: Make the row unselectable, disable its menu and say why in the description.

Avoid: Let the owner be selected and fail the bulk action.

Why: A control that cannot succeed should not be offered.

Checked by: review only. Look for: Select all and check the owner stays unselected.

Source evidence:
- src/components/v4/patterns/access-list.tsx

## State guidance

- revoked: Rows leave the list and the footer offers Undo.
- empty: A compact empty state says nobody else has access yet.

## Presentation rules

Do: Say how each member got access in plain words.

Avoid: Show internal policy identifiers as the description.

Why: People decide on access by who granted it and why.

## Import and exports

- src/components/v4/patterns/access-list.tsx
- src/components/v4/patterns/patterns.module.css

Exports: AccessList. Source TypeScript defines the API.

## Behavior

- A toolbar above the list says how many have access and offers Add member.
- Members are link rows in a framed List with selection, an Avatar, the role as a Badge, how they got access, last use and a row menu.
- Selecting rows raises a contained FloatingActionBar with Revoke access. The owner cannot be selected and its menu is disabled.
- After a revoke, a status line in the list footer says how many lost access and Undo restores them.

## Accessibility

- The List's select-all and row checkboxes are named for the member; the bulk bar is a named toolbar with a count status.
- Machine and agent names are set in mono.

## Use cases

- Use AccessList for who can reach one project or resource, with roles in words and temporary access saying when it ends.

## Avoid

- Color roles, or confirm every revoke with a dialog when Undo can restore it.

## Limits

- The host owns the members and persists revokes and restores.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### row state

- owner locked: example `default`, visible label "Owner locked, multiple selection with the bulk bar".
- selectable: example `default`, visible label "Owner locked, multiple selection with the bulk bar".
- current: example `default`, visible label "Owner locked, multiple selection with the bulk bar".

## Executable examples

### Members of a project

Save this example at `src/pages/design-system/examples/access-list/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard.

Registry items used: @infisical/access-list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { AccessList, type AccessMember } from "../../../../components/v4/patterns/access-list";
const everyone: AccessMember[] = [
    {
        id: "sarah",
        name: "Sarah Lin",
        role: "Owner",
        via: "Created the project. Transfer ownership to remove.",
        lastUsed: "2m ago",
        owner: true,
        href: "#access-list"
    },
    {
        id: "marcus",
        name: "Marcus Okonkwo-Fitzgerald",
        role: "Admin",
        via: "Through the Platform team",
        lastUsed: "1h ago",
        href: "#access-list"
    },
    {
        id: "priya",
        name: "Priya Raman",
        role: "Read",
        via: "Temporary, until 11:46",
        lastUsed: "Yesterday",
        href: "#access-list"
    },
    {
        id: "deployer",
        name: "github-deployer",
        kind: "machine",
        role: "Write",
        via: "Machine identity, universal auth",
        lastUsed: "4m ago",
        href: "#access-list"
    },
    {
        id: "agent",
        name: "release-notes-agent",
        kind: "agent",
        role: "Read, 1 hour",
        via: "Granted by Marcus",
        href: "#access-list"
    }
];
export default function Example() {
    const [members, setMembers] = useState(everyone);
    const [open, setOpen] = useState("marcus");
    const missing = everyone.find((member) => !members.some((entry) => entry.id === member.id));
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <AccessList project="payments-api" members={members} current={open} onOpen={setOpen} onAdd={missing ? () => setMembers((value) => [...value, missing]) : undefined} onRevoke={(ids) => setMembers((value) => value.filter((member) => !ids.includes(member.id)))} onRestore={(ids) => setMembers((value) => [
            ...value,
            ...everyone.filter((member) => ids.includes(member.id) && !value.some((entry) => entry.id === member.id))
        ])}/>
    </div><figcaption className="text-muted-foreground text-xs">{"Owner locked, multiple selection with the bulk bar"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#access-list and exercise the documented interaction.
