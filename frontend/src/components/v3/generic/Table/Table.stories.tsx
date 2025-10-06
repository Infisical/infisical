import type { Meta, StoryObj } from "@storybook/react-vite";
import { CopyIcon, EditIcon, MoreHorizontalIcon, TrashIcon } from "lucide-react";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v3/generic";
import { ProductIconMap, ScopeIconMap } from "@app/components/v3/platform";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./Table";

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
    <Table className="w-[800px]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3">Name</TableHead>
          <TableHead className="w-1/3">Role</TableHead>
          <TableHead className="w-1/3">Managed By</TableHead>
          <TableHead className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {identities.map((identity) => (
          <TableRow key={identity.name}>
            <TableCell className="font-medium">{identity.name}</TableCell>
            <TableCell>{identity.role}</TableCell>
            <TableCell>
              {identity.managedBy ? (
                <Badge variant={identity.managedBy.scope}>
                  {ScopeIconMap[identity.managedBy.scope]}
                  {identity.managedBy.name}
                </Badge>
              ) : (
                <Badge variant="ssh">
                  {ProductIconMap.ssh}
                  logging
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="ghost" size="xs">
                    <MoreHorizontalIcon />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem>
                    <CopyIcon />
                    Copy ID
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <EditIcon />
                    Edit Identity
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="danger">
                    <TrashIcon />
                    Delete Identity
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
