import type { Meta, StoryObj } from "@storybook/react-vite";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../Table";
import { Spinner } from "./Spinner";

/**
 * `Spinner` communicates indeterminate activity when the interface cannot show
 * concrete progress. Use it for compact refreshes and isolated loading states;
 * use `Skeleton` when the shape of pending content is already known.
 */
const meta = {
  title: "Generic/Spinner",
  component: Spinner,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg"]
    },
    label: {
      control: "text"
    },
    className: {
      table: { disable: true }
    }
  },
  args: {
    label: "Loading",
    size: "md"
  }
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Use `xs` for compact inline and table refresh states, `sm` for controls, `md` for isolated sections, and `lg` only for prominent loading states."
      }
    }
  },
  render: () => (
    <div className="flex items-center gap-6">
      {(["xs", "sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex flex-col items-center gap-2 text-xs text-muted">
          <Spinner size={size} label={`Loading ${size} example`} />
          <span>{size}</span>
        </div>
      ))}
    </div>
  )
};

export const TableRefresh: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "An `xs` spinner can occupy a narrow table-header cell while existing rows refresh in place. Give the spinner a label that names the content being refreshed."
      }
    }
  },
  render: () => (
    <div className="w-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="w-5">
              <Spinner size="xs" label="Refreshing machine identities" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Production Bot</TableCell>
            <TableCell>Viewer</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
};
