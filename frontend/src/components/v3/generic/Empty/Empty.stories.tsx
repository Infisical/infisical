import type { Meta, StoryObj } from "@storybook/react-vite";
import { KeyIcon, PlusIcon, SearchIcon, UploadIcon } from "lucide-react";

import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "./Empty";

/**
 * Empty renders a centered placeholder for lists, tables, and panels with no data yet.
 * Compose a header (`EmptyTitle` + `EmptyDescription`) with an optional `EmptyContent`
 * for actions. Use it to explain why a view is empty and offer the next step — never
 * just a silent blank region.
 *
 * **Prefer no icon.** Skip `EmptyMedia` in most cases — the dashed frame plus the title
 * already signal the empty state clearly, and an additional icon often reads as decorative
 * noise. Reserve `EmptyMedia` for genuinely ambiguous views where the icon meaningfully
 * disambiguates the context (e.g. a search miss vs a never-populated list).
 *
 * The component ships with `border-dashed` styling but **no border width** by default —
 * at the page level the frame-less look is intentional. When nesting `Empty` inside a
 * `Card`, `Sheet`, or `Dialog`, add `className="border"` to activate the dashed frame
 * so the empty state reads as visually distinct from its container.
 */
const meta = {
  title: "Generic/Empty",
  component: Empty,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    className: "w-[600px]"
  },
  argTypes: {
    children: {
      table: {
        disable: true
      }
    },
    className: {
      table: {
        disable: true
      }
    }
  }
} satisfies Meta<typeof Empty>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The baseline empty state — title, description, and a single call-to-action in `EmptyContent`. **No icon** by default: the dashed frame plus the title are enough to signal the empty state, so adding an icon rarely earns its space. Reach for `EmptyMedia` only when the icon meaningfully disambiguates the context."
      }
    }
  },
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyTitle>No secrets yet</EmptyTitle>
        <EmptyDescription>
          Secrets store sensitive values like API keys and credentials. Add your first one to get
          started.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>
          <PlusIcon />
          Add secret
        </Button>
      </EmptyContent>
    </Empty>
  )
};

export const WithIconMedia: Story = {
  name: "Example: With Icon Media",
  parameters: {
    docs: {
      description: {
        story:
          'Pass `variant="icon"` to `EmptyMedia` for a framed icon with a subtle inner shadow — use when the default large icon feels too heavy and a smaller, chip-like icon reads better.'
      }
    }
  },
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <KeyIcon />
        </EmptyMedia>
        <EmptyTitle>No active access tokens</EmptyTitle>
        <EmptyDescription>
          Access tokens let machines authenticate with the Infisical API. Generate one to connect a
          client.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">
          <PlusIcon />
          Generate token
        </Button>
      </EmptyContent>
    </Empty>
  )
};

export const WithLink: Story = {
  name: "Example: With Link",
  parameters: {
    docs: {
      description: {
        story:
          "Inline `<a>` tags inside `EmptyDescription` render with an underline at the muted text color and brighten to `text-foreground` on hover — neutral enough to read as a secondary reference without competing with primary actions."
      }
    }
  },
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UploadIcon />
        </EmptyMedia>
        <EmptyTitle>Import your secrets</EmptyTitle>
        <EmptyDescription>
          Upload a `.env` or CSV file to import secrets in bulk. See the{" "}
          <a href="#">import documentation</a> for supported formats.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">
          <UploadIcon />
          Import file
        </Button>
      </EmptyContent>
    </Empty>
  )
};

export const NoResults: Story = {
  name: "Example: No Search Results",
  parameters: {
    docs: {
      description: {
        story:
          "Skip `EmptyContent` when there's no constructive action to offer — as with a search miss, where the user's next step is to refine the query, not click a button."
      }
    }
  },
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchIcon />
        </EmptyMedia>
        <EmptyTitle>No results found</EmptyTitle>
        <EmptyDescription>
          No secrets match your search. Try a different keyword or clear the filters.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
};

export const Minimal: Story = {
  name: "Example: Minimal",
  parameters: {
    docs: {
      description: {
        story:
          "Omit the media entirely for a compact empty state. Useful for nested panels where a large illustration would dominate."
      }
    }
  },
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyTitle>Nothing here yet</EmptyTitle>
        <EmptyDescription>
          Items in this section will appear once they&apos;re created.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
};

export const InsideCard: Story = {
  name: "Example: Inside Card / Sheet / Dialog",
  parameters: {
    docs: {
      description: {
        story:
          'When nesting `Empty` inside a `Card`, `Sheet`, or `Dialog`, add `className="border"` to activate the dashed frame that ships with the component. Without a border width the dashed styling is inert, so the empty state blends into its parent surface — the border gives it its own visual boundary inside the container.'
      }
    }
  },
  render: () => (
    <Card className="w-[700px]">
      <CardHeader>
        <CardTitle>Access tokens</CardTitle>
      </CardHeader>
      <CardContent>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyIcon />
            </EmptyMedia>
            <EmptyTitle>No active access tokens</EmptyTitle>
            <EmptyDescription>
              Access tokens let machines authenticate with the Infisical API. Generate one to
              connect a client.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline">
              <PlusIcon />
              Generate token
            </Button>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  )
};
