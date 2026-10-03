import type { Meta, StoryObj } from "@storybook/react-vite";

import { Field, FieldLabel } from "../Field";
import { Input } from "../Input";
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
        <AccordionContent className="p-6">
          Content for section one. This is a basic example of accordion content.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="section-2">
        <AccordionTrigger>Section Two</AccordionTrigger>
        <AccordionContent className="p-6">
          Content for section two. Each section can be expanded independently.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="section-3">
        <AccordionTrigger>Section Three</AccordionTrigger>
        <AccordionContent className="p-6">Content for section three.</AccordionContent>
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
        <AccordionContent className="p-6">
          Content for section one. This is a basic example of accordion content.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="section-2">
        <AccordionTrigger>Section Two</AccordionTrigger>
        <AccordionContent className="p-6">
          Content for section two. Each section can be expanded independently.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="section-3">
        <AccordionTrigger>Section Three</AccordionTrigger>
        <AccordionContent className="p-6">Content for section three.</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
};

export const InteractiveContent: Story = {
  name: "Example: Interactive Content",
  args: {
    variant: "ghost",
    type: "single",
    collapsible: true,
    defaultValue: "advanced-options"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Expanded content allows intentional overflow so focus rings, validation rings, and portalled controls remain visible. Overflow is clipped only while the section animates open or closed."
      }
    }
  },
  render: (args) => (
    <Accordion {...args} className="w-80">
      <AccordionItem value="advanced-options">
        <AccordionTrigger>Advanced Options</AccordionTrigger>
        <AccordionContent className="py-3">
          <Field>
            <FieldLabel htmlFor="accordion-kms-key">KMS Key</FieldLabel>
            <Input id="accordion-kms-key" placeholder="Select a KMS key..." />
          </Field>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
};
