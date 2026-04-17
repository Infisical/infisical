import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditIcon } from "lucide-react";

import { Badge } from "../Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { Detail, DetailGroup, DetailHeader, DetailLabel, DetailValue } from "../Detail";
import { IconButton } from "../IconButton";
import { Separator } from "../Separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./Accordion";

/**
 * Accordions allow users to expand and collapse sections of content.
 * The variant determines the visual style of the accordion.
 */
const meta = {
  title: "Generic/Accordion",
  component: Accordion,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "ghost"]
    }
  }
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Variant: Default",
  args: {
    variant: "default",
    type: "single",
    collapsible: true
  },
  parameters: {
    docs: {
      description: {
        story:
          "The default variant renders a bordered, contained accordion suitable for standalone content sections."
      }
    }
  },
  render: (args) => (
    <Accordion {...args} className="w-80">
      <AccordionItem value="section-1">
        <AccordionTrigger>Section One</AccordionTrigger>
        <AccordionContent>
          Content for section one. This is a basic example of accordion content.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="section-2">
        <AccordionTrigger>Section Two</AccordionTrigger>
        <AccordionContent>
          Content for section two. Each section can be expanded independently.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="section-3">
        <AccordionTrigger>Section Three</AccordionTrigger>
        <AccordionContent>Content for section three.</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
};

export const Ghost: Story = {
  name: "Variant: Ghost",
  args: {
    variant: "ghost",
    type: "single",
    collapsible: true
  },
  parameters: {
    docs: {
      description: {
        story:
          "The ghost variant renders a borderless accordion suitable for embedding within cards or other containers."
      }
    }
  },
  render: (args) => (
    <Accordion {...args} className="w-80">
      <AccordionItem value="section-1">
        <AccordionTrigger>Section One</AccordionTrigger>
        <AccordionContent>
          Content for section one. This is a basic example of accordion content.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="section-2">
        <AccordionTrigger>Section Two</AccordionTrigger>
        <AccordionContent>
          Content for section two. Each section can be expanded independently.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="section-3">
        <AccordionTrigger>Section Three</AccordionTrigger>
        <AccordionContent>Content for section three.</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
};

export const GhostCard: Story = {
  name: "Example: Ghost Card",
  args: {
    type: "multiple",
    variant: "ghost"
  },
  parameters: {
    docs: {
      description: {
        story:
          "A ghost accordion composed inside a Card, demonstrating a discovery detail panel layout with Detail and Badge components."
      }
    }
  },
  decorators: () => (
    <Card className="w-80">
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <DetailHeader className="flex items-center justify-between">
            General
            <IconButton size="xs" variant="ghost-muted">
              <EditIcon />
            </IconButton>
          </DetailHeader>
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
              <IconButton size="xs" className="absolute top-1.5 right-0" variant="ghost-muted">
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
              <IconButton size="xs" className="absolute top-1.5 right-0" variant="ghost-muted">
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
