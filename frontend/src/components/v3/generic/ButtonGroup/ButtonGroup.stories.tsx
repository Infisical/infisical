import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ChevronDownIcon,
  CopyIcon,
  EditIcon,
  GitBranchIcon,
  TrashIcon
} from "lucide-react";

import { Badge } from "../Badge";
import { Button } from "../Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../Dropdown";
import { IconButton } from "../IconButton";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "./ButtonGroup";

/**
 * ButtonGroups visually join related controls into a single connected element —
 * borders are shared between adjacent children and the outer corners are rounded.
 * Use a ButtonGroup for toolbars, segmented controls, key-value badge pairs, or
 * any cluster of controls that operate on the same context.
 */
const meta = {
  title: "Generic/ButtonGroup",
  component: ButtonGroup,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"]
    },
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
} satisfies Meta<typeof ButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  name: "Variant: Horizontal",
  args: {
    orientation: "horizontal"
  },
  parameters: {
    docs: {
      description: {
        story:
          "The default orientation — children join left-to-right with shared vertical borders. Use for toolbars and segmented controls."
      }
    }
  },
  render: (args) => (
    <ButtonGroup {...args}>
      <IconButton variant="outline" aria-label="Align left">
        <AlignLeftIcon />
      </IconButton>
      <IconButton variant="outline" aria-label="Align center">
        <AlignCenterIcon />
      </IconButton>
      <IconButton variant="outline" aria-label="Align right">
        <AlignRightIcon />
      </IconButton>
    </ButtonGroup>
  )
};

export const Vertical: Story = {
  name: "Variant: Vertical",
  args: {
    orientation: "vertical"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Stack children top-to-bottom with shared horizontal borders. Use in narrow sidebars or mobile layouts where a horizontal group would overflow."
      }
    }
  },
  render: (args) => (
    <ButtonGroup {...args}>
      <IconButton variant="outline" aria-label="Edit">
        <EditIcon />
      </IconButton>
      <IconButton variant="outline" aria-label="Duplicate">
        <CopyIcon />
      </IconButton>
      <IconButton variant="outline" aria-label="Delete">
        <TrashIcon />
      </IconButton>
    </ButtonGroup>
  )
};

export const KeyValuePair: Story = {
  name: "Example: Key-Value Pair",
  parameters: {
    docs: {
      description: {
        story:
          "Pair a default `Badge` (key) with an outline `Badge` (value) to render a joined key-value chip. Used for identity and user metadata throughout the app."
      }
    }
  },
  render: () => (
    <ButtonGroup>
      <Badge>environment</Badge>
      <Badge variant="outline">production</Badge>
    </ButtonGroup>
  )
};

export const WithText: Story = {
  name: "Example: With Text",
  parameters: {
    docs: {
      description: {
        story:
          "Use `ButtonGroupText` to embed a static label between interactive children — useful for labelled actions like 'Branch: main' with a trigger to switch."
      }
    }
  },
  render: () => (
    <ButtonGroup>
      <ButtonGroupText>
        <GitBranchIcon />
        main
      </ButtonGroupText>
      <Button variant="outline">
        Switch
        <ChevronDownIcon />
      </Button>
    </ButtonGroup>
  )
};

export const WithSeparator: Story = {
  name: "Example: With Separator",
  parameters: {
    docs: {
      description: {
        story:
          "Insert a `ButtonGroupSeparator` to visually group related actions within the same bar — the separator sits flush with the shared border and inherits the group's orientation."
      }
    }
  },
  render: () => (
    <ButtonGroup>
      <IconButton variant="outline" size="sm" aria-label="Align left">
        <AlignLeftIcon />
      </IconButton>
      <IconButton variant="outline" size="sm" aria-label="Align center">
        <AlignCenterIcon />
      </IconButton>
      <IconButton variant="outline" size="sm" aria-label="Align right">
        <AlignRightIcon />
      </IconButton>
      <ButtonGroupSeparator />
      <IconButton variant="outline" size="sm" aria-label="Duplicate">
        <CopyIcon />
      </IconButton>
      <IconButton variant="outline" size="sm" aria-label="Delete">
        <TrashIcon />
      </IconButton>
    </ButtonGroup>
  )
};

export const SplitButton: Story = {
  name: "Example: Split Button",
  parameters: {
    docs: {
      description: {
        story:
          "Pair a primary action `Button` with a chevron `IconButton` that opens a `DropdownMenu` of related variants. Clicking the main button fires the default action; clicking the chevron reveals alternates."
      }
    }
  },
  render: () => (
    <ButtonGroup>
      <Button variant="outline">Save</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton variant="outline" aria-label="More save options">
            <ChevronDownIcon />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Save and close</DropdownMenuItem>
          <DropdownMenuItem>Save as draft</DropdownMenuItem>
          <DropdownMenuItem>Save as template</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
};
