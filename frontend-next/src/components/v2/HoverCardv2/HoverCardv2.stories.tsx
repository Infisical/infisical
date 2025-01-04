import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "../Button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardContentProps,
  HoverCardTrigger
} from "./HoverCardv2";

const meta: Meta<typeof HoverCardContent> = {
  title: "Components/HoverCard",
  component: HoverCard,
  tags: ["v2"]
};

export default meta;
type Story = StoryObj<typeof HoverCardContent>;

const Template = (args: HoverCardContentProps) => (
  <HoverCard>
    <HoverCardTrigger>
      <Button>Hello world</Button>
    </HoverCardTrigger>
    <HoverCardContent {...args} sideOffset={10}>
      <div className="bg-mineshaft-600 p-4 text-gray-400">
        <h1>This is hover card</h1>
      </div>
    </HoverCardContent>
  </HoverCard>
);

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
export const Primary: Story = {
  render: (args) => <Template {...args} />
};
