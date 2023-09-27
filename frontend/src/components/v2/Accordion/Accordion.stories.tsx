import type { Meta, StoryObj } from "@storybook/react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./Accordion";

const meta: Meta<typeof Accordion> = {
  title: "Components/Accordion",
  component: Accordion,
  tags: ["v2"],
  argTypes: {}
};

export default meta;
type Story = StoryObj<typeof Accordion>;

export const Basic: Story = {
  render: (args) => (
    <div className="flex justify-center w-full">
      <Accordion {...args}>
        <AccordionItem value="section-1">
          <AccordionTrigger>Section 1</AccordionTrigger>
          <AccordionContent>Description of Section 1</AccordionContent>
        </AccordionItem>
        <AccordionItem value="section-2">
          <AccordionTrigger>Section 2</AccordionTrigger>
          <AccordionContent>Description of Section 2</AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
};
