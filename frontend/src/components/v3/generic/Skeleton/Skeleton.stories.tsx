import type { Meta, StoryObj } from "@storybook/react-vite";

import { Card, CardContent, CardHeader } from "../Card";
import { Field, FieldGroup, FieldLabel } from "../Field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../Table";
import { Skeleton } from "./Skeleton";

/**
 * `Skeleton` is the v3 loading placeholder. It renders a single pulsing block
 * with subtly rounded corners — and nothing else. There are no variants, no
 * `size` prop, and no intrinsic dimensions. Every usage shapes the placeholder
 * by passing utility classes through `className`.
 *
 * Three things to know before reaching for it:
 *
 * 1. **Set width and height explicitly.** A bare `<Skeleton />` collapses to
 *    zero. Size the placeholder so it roughly matches the content it stands
 *    in for — that way the layout doesn't reflow when real data swaps in.
 * 2. **Override the default shape via `className`.** The default rounded
 *    rectangle is merged through `cn`, so callers can flip to a circle for
 *    avatars, a pill for chips, or a darker tint when the placeholder sits on
 *    an already-muted surface.
 * 3. **Use `data-slot="skeleton"`** as the hook for any consumer-level styling
 *    or test queries — the attribute is set on every `Skeleton` instance.
 *
 * The example stories below show `Skeleton` slotted into the v3 primitives
 * that most often need a loading state — `Card`, `Table`, and `Field`-based
 * forms.
 */
const meta = {
  title: "Generic/Skeleton",
  component: Skeleton,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    className: {
      table: { disable: true }
    },
    children: {
      table: { disable: true }
    }
  }
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Baseline pulsing block. `Skeleton` has no intrinsic size — every usage sets width and height through `className`. Pick one of the *Example* stories below as a starting point and adjust dimensions to match the content being loaded."
      }
    }
  },
  render: () => <Skeleton className="h-4 w-48" />
};

export const ExampleCard: Story = {
  name: "Example: Card",
  parameters: {
    docs: {
      description: {
        story:
          "Drop `Skeleton`s inside a `Card` while the card's data fetches — title, description, and body all stand in for the real content. The card's chrome (border, padding, shadow) renders immediately, so the user sees the layout shape before the content arrives. Used while project tiles, integration cards, and dashboard widgets are loading."
      }
    }
  },
  render: () => (
    <Card className="w-sm">
      <CardHeader>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </CardContent>
    </Card>
  )
};

export const ExampleTableRow: Story = {
  name: "Example: Table",
  decorators: [
    (Story) => (
      <div className="w-[38rem]">
        <Story />
      </div>
    )
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Render a `Skeleton` in each `TableCell` while the table's rows fetch — repeat the row once per expected entry (often 5–10) so the table height stays stable through the swap. Keep the skeletons rectangular: rounded placeholders read as avatars and would mislead the user about the real cell content."
      }
    }
  },
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Last active</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-48" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-24" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
};

export const ExampleFormField: Story = {
  name: "Example: Form",
  parameters: {
    docs: {
      description: {
        story:
          "Stand a `Skeleton` in for each `Input` while a settings form fetches its initial values. Real `FieldLabel` text renders immediately — the form's structure is known, only the values are loading. Match each skeleton's height to the `Input`'s height so the layout doesn't twitch when the real controls mount."
      }
    }
  },
  render: () => (
    <FieldGroup className="w-sm">
      <Field>
        <FieldLabel>Display name</FieldLabel>
        <Skeleton className="h-9 w-full" />
      </Field>
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Skeleton className="h-9 w-full" />
      </Field>
      <Field>
        <FieldLabel>Role</FieldLabel>
        <Skeleton className="h-9 w-full" />
      </Field>
    </FieldGroup>
  )
};
