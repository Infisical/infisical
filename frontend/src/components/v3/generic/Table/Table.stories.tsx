import type { Meta, StoryObj } from "@storybook/react-vite";
import { CopyIcon, EditIcon, MoreHorizontalIcon, TrashIcon } from "lucide-react";

import {
  Badge,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton
} from "@app/components/v3/generic";
import { ProjectIcon } from "@app/components/v3/platform";

import {
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "./Table";

const identities: {
  name: string;
  role: string;
  managedBy?: { scope: "org" | "namespace"; name: string };
}[] = [
  {
    name: "machine-one",
    role: "Admin",
    managedBy: {
      scope: "org",
      name: "infisical"
    }
  },
  {
    name: "machine-two",
    role: "Viewer",
    managedBy: {
      scope: "namespace",
      name: "engineering"
    }
  },
  {
    name: "machine-three",
    role: "Developer"
  },
  {
    name: "machine-four",
    role: "Admin",
    managedBy: {
      scope: "namespace",
      name: "dev-ops"
    }
  },
  {
    name: "machine-five",
    role: "Viewer",
    managedBy: {
      scope: "org",
      name: "infisical"
    }
  },
  {
    name: "machine-six",
    role: "Developer"
  }
];

function TableDemo() {
  return (
    <UnstableTable className="w-[800px]">
      <UnstableTableHeader>
        <UnstableTableRow>
          <UnstableTableHead className="w-1/3">Name</UnstableTableHead>
          <UnstableTableHead className="w-1/3">Role</UnstableTableHead>
          <UnstableTableHead className="w-1/3">Managed By</UnstableTableHead>
          <UnstableTableHead className="text-right" />
        </UnstableTableRow>
      </UnstableTableHeader>
      <UnstableTableBody>
        {identities.map((identity) => (
          <UnstableTableRow key={identity.name}>
            <UnstableTableCell className="font-medium">{identity.name}</UnstableTableCell>
            <UnstableTableCell>{identity.role}</UnstableTableCell>
            <UnstableTableCell>
              <Badge variant="project">
                <ProjectIcon />
                Project
              </Badge>
            </UnstableTableCell>
            <UnstableTableCell className="text-right">
              <UnstableDropdownMenu>
                <UnstableDropdownMenuTrigger asChild>
                  <UnstableIconButton variant="ghost" size="xs">
                    <MoreHorizontalIcon />
                  </UnstableIconButton>
                </UnstableDropdownMenuTrigger>
                <UnstableDropdownMenuContent align="end" className="w-36">
                  <UnstableDropdownMenuItem>
                    <CopyIcon />
                    Copy ID
                  </UnstableDropdownMenuItem>
                  <UnstableDropdownMenuItem>
                    <EditIcon />
                    Edit Identity
                  </UnstableDropdownMenuItem>
                  <UnstableDropdownMenuItem variant="danger">
                    <TrashIcon />
                    Delete Identity
                  </UnstableDropdownMenuItem>
                </UnstableDropdownMenuContent>
              </UnstableDropdownMenu>
            </UnstableTableCell>
          </UnstableTableRow>
        ))}
      </UnstableTableBody>
    </UnstableTable>
  );
}

const meta = {
  title: "Generic/Table",
  component: TableDemo,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {}
} satisfies Meta<typeof TableDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KitchenSInk: Story = {
  name: "Example: Kitchen Sink",
  args: {}
};
