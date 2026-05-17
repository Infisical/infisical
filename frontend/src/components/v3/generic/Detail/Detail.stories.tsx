import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditIcon } from "lucide-react";

import { Badge } from "../Badge";
import { IconButton } from "../IconButton";
import { Separator } from "../Separator";
import { Detail, DetailGroup, DetailGroupHeader, DetailLabel, DetailValue } from "./Detail";

/**
 * Detail renders a single label + value pair — the building block for entity
 * metadata panels (identity details, user profiles, integration configuration).
 * Compose multiple `Detail`s inside a `DetailGroup` for vertical spacing; add a
 * `DetailGroupHeader` above a group to name the section.
 */
const meta = {
  title: "Generic/Detail",
  component: Detail,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
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
  },
  globals: {
    backgrounds: { value: "card" }
  }
} satisfies Meta<typeof Detail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {
  name: "Example: Single",
  parameters: {
    docs: {
      description: {
        story:
          "The minimal usage — a single `Detail` wrapping a `DetailLabel` and `DetailValue`. Use when displaying a standalone field outside a grouped panel."
      }
    }
  },
  render: () => (
    <Detail className="w-80">
      <DetailLabel>Repository</DetailLabel>
      <DetailValue>infisical/infisical</DetailValue>
    </Detail>
  )
};

export const Group: Story = {
  name: "Example: Group",
  parameters: {
    docs: {
      description: {
        story:
          "Wrap multiple `Detail`s in a `DetailGroup` to stack them with consistent vertical spacing. Use for entity metadata sections like profile fields or integration settings."
      }
    }
  },
  render: () => (
    <DetailGroup className="w-80">
      <Detail>
        <DetailLabel>Name</DetailLabel>
        <DetailValue>ad-discovery-001</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Status</DetailLabel>
        <DetailValue>
          <Badge variant="success">Active</Badge>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Schedule</DetailLabel>
        <DetailValue>Manual</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Last Run</DetailLabel>
        <DetailValue>04/11/2026, 02:47 AM</DetailValue>
      </Detail>
    </DetailGroup>
  )
};

export const GroupWithHeader: Story = {
  name: "Example: Group With Header",
  parameters: {
    docs: {
      description: {
        story:
          "Place a `DetailGroupHeader` as the first child of a `DetailGroup` to title the section. Pair the title with a trailing inline action — an edit `IconButton`, a copy button, an external link — to put a contextual control beside the section name."
      }
    }
  },
  render: () => (
    <DetailGroup className="w-80">
      <DetailGroupHeader className="flex items-center justify-between">
        General
        <IconButton size="xs" variant="ghost-muted" aria-label="Edit general">
          <EditIcon />
        </IconButton>
      </DetailGroupHeader>
      <Detail>
        <DetailLabel>Name</DetailLabel>
        <DetailValue>ad-discovery-001</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Status</DetailLabel>
        <DetailValue>
          <Badge variant="success">Active</Badge>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Schedule</DetailLabel>
        <DetailValue>Manual</DetailValue>
      </Detail>
    </DetailGroup>
  )
};

export const BadgeValues: Story = {
  name: "Example: Badge Values",
  parameters: {
    docs: {
      description: {
        story:
          "Use `Badge` inside `DetailValue` for status, scope, or boolean-like fields — far more scannable than plain text. Mix badges with inline text by laying the value out as a flex row when a single field needs both."
      }
    }
  },
  render: () => (
    <DetailGroup className="w-80">
      <Detail>
        <DetailLabel>Status</DetailLabel>
        <DetailValue>
          <Badge variant="success">Active</Badge>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>LDAP Port</DetailLabel>
        <DetailValue className="flex items-center gap-1.5">
          636 <Badge variant="info">LDAPS</Badge>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>CA Certificate</DetailLabel>
        <DetailValue>
          <Badge variant="success">Provided</Badge>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Dependency Discovery</DetailLabel>
        <DetailValue>
          <Badge variant="danger">Disabled</Badge>
        </DetailValue>
      </Detail>
    </DetailGroup>
  )
};

export const MultipleGroups: Story = {
  name: "Example: Multiple Groups",
  parameters: {
    docs: {
      description: {
        story:
          "Stack multiple `DetailGroup`s with a `Separator` between them to visually chunk long detail panels. Each group gets its own header and list of fields."
      }
    }
  },
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <DetailGroup>
        <DetailGroupHeader>General</DetailGroupHeader>
        <Detail>
          <DetailLabel>Name</DetailLabel>
          <DetailValue>ad-discovery-001</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Status</DetailLabel>
          <DetailValue>
            <Badge variant="success">Active</Badge>
          </DetailValue>
        </Detail>
      </DetailGroup>
      <Separator />
      <DetailGroup>
        <DetailGroupHeader>Credentials</DetailGroupHeader>
        <Detail>
          <DetailLabel>Username</DetailLabel>
          <DetailValue>svc-discovery</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Password</DetailLabel>
          <DetailValue className="tracking-widest">••••••••••••</DetailValue>
        </Detail>
      </DetailGroup>
    </div>
  )
};
