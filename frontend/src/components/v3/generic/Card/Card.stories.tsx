import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  EditIcon,
  EllipsisIcon,
  LockIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  TrashIcon
} from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../Accordion";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Detail, DetailGroup, DetailGroupHeader, DetailLabel, DetailValue } from "../Detail";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../Dropdown";
import { IconButton } from "../IconButton";
import { Separator } from "../Separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../Table";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "./Card";

/**
 * Cards group related content and actions within a bordered, rounded container.
 * Compose a card from `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`,
 * `CardContent`, and `CardFooter` subcomponents — the layout is driven entirely
 * by composition and className modifiers (e.g. `border-b` on a header or
 * `border-t` on a footer to render a divider).
 */
const meta = {
  title: "Generic/Card",
  component: Card,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    className: "w-[500px]"
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
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The minimal card — a `<Card>` wrapping a single `<CardContent>`. Use this as a baseline container for grouped content."
      }
    }
  },
  render: (args) => (
    <Card {...args}>
      <CardContent>
        A card provides a bordered, rounded surface for grouping related content.
      </CardContent>
    </Card>
  )
};

export const WithHeader: Story = {
  name: "Example: With Header",
  parameters: {
    docs: {
      description: {
        story:
          "Add a `CardHeader` with a `CardTitle` and optional `CardDescription` to label the card's content."
      }
    }
  },
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Account Settings</CardTitle>
        <CardDescription>Manage your account preferences and security options.</CardDescription>
      </CardHeader>
      <CardContent>
        Update your profile information, change your password, or configure multi-factor
        authentication.
      </CardContent>
    </Card>
  )
};

export const DividedHeader: Story = {
  name: "Example: Divided Header",
  parameters: {
    docs: {
      description: {
        story:
          'Add `className="border-b"` to `CardHeader` to render a divider between the header and content. The header\'s internal styling automatically adds bottom padding when the `border-b` class is present.'
      }
    }
  },
  render: (args) => (
    <Card {...args}>
      <CardHeader className="border-b">
        <CardTitle>Account Settings</CardTitle>
        <CardDescription>Manage your account preferences and security options.</CardDescription>
      </CardHeader>
      <CardContent>
        Update your profile information, change your password, or configure multi-factor
        authentication.
      </CardContent>
    </Card>
  )
};

export const WithAction: Story = {
  name: "Example: With Action",
  parameters: {
    docs: {
      description: {
        story:
          "Place a `CardAction` inside `CardHeader` to render a top-right action. The header automatically switches to a two-column grid when an action is present."
      }
    }
  },
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Configure which events send you an alert.</CardDescription>
        <CardAction>
          <IconButton size="xs" variant="ghost-muted" aria-label="More options">
            <MoreHorizontalIcon />
          </IconButton>
        </CardAction>
      </CardHeader>
      <CardContent>You currently have 3 notification channels enabled.</CardContent>
    </Card>
  )
};

export const WithFooter: Story = {
  name: "Example: With Footer",
  parameters: {
    docs: {
      description: {
        story:
          'Add a `CardFooter` with `className="border-t"` to place actions below the content with a divider. The footer\'s internal styling automatically adds top padding when the `border-t` class is present.'
      }
    }
  },
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Delete workspace</CardTitle>
        <CardDescription>
          Permanently remove this workspace and all of its contents. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end border-t">
        <Button variant="danger" size="sm">
          Delete workspace
        </Button>
      </CardFooter>
    </Card>
  )
};

export const FullComposition: Story = {
  name: "Example: Full Composition",
  parameters: {
    docs: {
      description: {
        story:
          "A realistic panel combining every subcomponent — divided header with title, description and action; body rendering a `DetailGroup`; divided footer with a primary action."
      }
    }
  },
  render: (args) => (
    <Card {...args} className="w-[300px]">
      <CardHeader className="border-b">
        <CardTitle>Integration</CardTitle>
        <CardDescription>GitHub · connected 2 days ago</CardDescription>
        <CardAction>
          <IconButton size="xs" variant="ghost-muted" aria-label="Settings">
            <SettingsIcon />
          </IconButton>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Repository</DetailLabel>
            <DetailValue>infisical/infisical</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Status</DetailLabel>
            <DetailValue>
              <Badge variant="success">Active</Badge>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Synced</DetailLabel>
            <DetailValue>04/24/2026, 09:12 AM</DetailValue>
          </Detail>
        </DetailGroup>
      </CardContent>
      <CardFooter className="justify-end border-t">
        <Button variant="outline" size="sm">
          Sync now
        </Button>
      </CardFooter>
    </Card>
  )
};

export const WithAccordion: Story = {
  name: "Example: With Accordion",
  parameters: {
    docs: {
      description: {
        story:
          "Embed a default `Accordion` in `CardContent` to list grouped sections, each with its own trigger-level actions and a two-column `Detail` grid in the body — the layout used by the Identity Auth Methods panel."
      }
    }
  },
  render: (args) => (
    <Card {...args} className="w-[800px]">
      <CardHeader>
        <CardTitle>Auth Methods</CardTitle>
        <CardDescription>
          Authentication methods configured on this identity. Each method can be edited or revoked
          independently.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple">
          <AccordionItem value="universal-auth">
            <AccordionTrigger>
              <span className="mr-auto">Universal Auth</span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  asChild
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Universal Auth options"
                >
                  <IconButton variant="ghost" size="xs">
                    <EllipsisIcon />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <EditIcon />
                    Edit Auth Method
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="danger">
                    <TrashIcon />
                    Remove Auth Method
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 gap-3">
                <Detail>
                  <DetailLabel>Access Token TTL (seconds)</DetailLabel>
                  <DetailValue>2592000</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Access Token Max TTL (seconds)</DetailLabel>
                  <DetailValue>5184000</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Max Number of Uses</DetailLabel>
                  <DetailValue>Unlimited</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Trusted IPs</DetailLabel>
                  <DetailValue>0.0.0.0/0</DetailValue>
                </Detail>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="kubernetes-auth">
            <AccordionTrigger>
              <span className="mr-auto">Kubernetes Auth</span>
              <Badge isSquare variant="danger" className="mr-2">
                <LockIcon />
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger
                  asChild
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Kubernetes Auth options"
                >
                  <IconButton variant="ghost" size="xs">
                    <EllipsisIcon />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <EditIcon />
                    Edit Auth Method
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="danger">
                    <TrashIcon />
                    Remove Auth Method
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 gap-3">
                <Detail>
                  <DetailLabel>Kubernetes Host</DetailLabel>
                  <DetailValue>https://kubernetes.default.svc</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Token Reviewer JWT</DetailLabel>
                  <DetailValue className="tracking-widest">••••••••••••</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Allowed Namespaces</DetailLabel>
                  <DetailValue>default, infisical</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Lockout</DetailLabel>
                  <DetailValue>
                    <Badge variant="danger">Active</Badge>
                  </DetailValue>
                </Detail>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="oidc-auth">
            <AccordionTrigger>
              <span className="mr-auto">OIDC Auth</span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  asChild
                  onClick={(e) => e.stopPropagation()}
                  aria-label="OIDC Auth options"
                >
                  <IconButton variant="ghost" size="xs">
                    <EllipsisIcon />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <EditIcon />
                    Edit Auth Method
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="danger">
                    <TrashIcon />
                    Remove Auth Method
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 gap-3">
                <Detail>
                  <DetailLabel>Discovery URL</DetailLabel>
                  <DetailValue>https://accounts.google.com</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Bound Issuer</DetailLabel>
                  <DetailValue>https://accounts.google.com</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Bound Audiences</DetailLabel>
                  <DetailValue>infisical-identity</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Lockout</DetailLabel>
                  <DetailValue>Disabled</DetailValue>
                </Detail>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
};

export const WithTable: Story = {
  name: "Example: With Table",
  parameters: {
    docs: {
      description: {
        story:
          "Embed a `Table` in `CardContent` to present tabular data alongside other card elements. The table brings its own border, so the card reads as a labelled wrapper around it."
      }
    }
  },
  render: (args) => (
    <Card {...args} className="w-[600px]">
      <CardHeader>
        <CardTitle>Recent Deployments</CardTitle>
        <CardDescription>The last five releases pushed to production.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            View all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Deployed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>v2.14.0</TableCell>
              <TableCell>cory</TableCell>
              <TableCell>
                <Badge variant="success">Success</Badge>
              </TableCell>
              <TableCell>2h ago</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>v2.13.2</TableCell>
              <TableCell>ellen</TableCell>
              <TableCell>
                <Badge variant="success">Success</Badge>
              </TableCell>
              <TableCell>1d ago</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>v2.13.1</TableCell>
              <TableCell>alice</TableCell>
              <TableCell>
                <Badge variant="danger">Failed</Badge>
              </TableCell>
              <TableCell>2d ago</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>v2.13.0</TableCell>
              <TableCell>jim</TableCell>
              <TableCell>
                <Badge variant="success">Success</Badge>
              </TableCell>
              <TableCell>2d ago</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>v2.12.4</TableCell>
              <TableCell>mike</TableCell>
              <TableCell>
                <Badge variant="warning">Partial</Badge>
              </TableCell>
              <TableCell>4d ago</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
};

export const DetailPanel: Story = {
  name: "Example: Detail Panel w/ Ghost Accordion",
  parameters: {
    docs: {
      description: {
        story:
          "A realistic detail panel combining a `DetailGroup` with inline edit actions, a `Separator`, and a ghost `Accordion` for progressively disclosed configuration sections. Use this layout for entity detail pages where top-level fields sit above collapsible groups."
      }
    }
  },
  render: (args) => (
    <Card {...args} className="w-[400px]">
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <DetailGroupHeader className="flex items-center justify-between">
            General
            <IconButton
              size="xs"
              onClick={(e) => e.preventDefault()}
              variant="ghost-muted"
              aria-label="Edit general"
            >
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
          <Detail>
            <DetailLabel>Last Run</DetailLabel>
            <DetailValue>04/11/2026, 02:47 AM</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Created</DetailLabel>
            <DetailValue>04/10/2026, 12:12 AM</DetailValue>
          </Detail>
        </DetailGroup>
        <Separator className="mt-4" />
        <Accordion type="multiple" variant="ghost">
          <AccordionItem value="configuration">
            <AccordionTrigger className="relative">
              Configuration
              <IconButton
                size="xs"
                onClick={(e) => e.preventDefault()}
                className="absolute top-1.5 right-0"
                variant="ghost-muted"
                aria-label="Edit configuration"
              >
                <EditIcon />
              </IconButton>
            </AccordionTrigger>
            <AccordionContent>
              <DetailGroup>
                <Detail>
                  <DetailLabel>Gateway</DetailLabel>
                  <DetailValue>discoverygwcf</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Domain FQDN</DetailLabel>
                  <DetailValue>corp.example.com</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>DC Address</DetailLabel>
                  <DetailValue>35.163.233.187</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>LDAP Port</DetailLabel>
                  <DetailValue className="flex items-center gap-1.5">
                    636 <Badge variant="info">LDAPS</Badge>
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>WinRM Port</DetailLabel>
                  <DetailValue className="flex items-center gap-1.5">
                    5986 <Badge variant="info">HTTPS</Badge>
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>LDAP CA Certificate</DetailLabel>
                  <DetailValue>
                    <Badge variant="success">Provided</Badge>
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>WinRM CA Certificate</DetailLabel>
                  <DetailValue>
                    <Badge variant="success">Provided</Badge>
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Dependency Discovery</DetailLabel>
                  <DetailValue>
                    <Badge variant="success">Enabled</Badge>
                  </DetailValue>
                </Detail>
              </DetailGroup>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="credentials">
            <AccordionTrigger className="relative">
              Credentials
              <IconButton
                onClick={(e) => e.preventDefault()}
                size="xs"
                className="absolute top-1.5 right-0"
                variant="ghost-muted"
                aria-label="Edit credentials"
              >
                <EditIcon />
              </IconButton>
            </AccordionTrigger>
            <AccordionContent>
              <DetailGroup>
                <Detail>
                  <DetailLabel>Username</DetailLabel>
                  <DetailValue>svc-discovery</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Password</DetailLabel>
                  <DetailValue className="tracking-widest">••••••••••••</DetailValue>
                </Detail>
              </DetailGroup>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
};
