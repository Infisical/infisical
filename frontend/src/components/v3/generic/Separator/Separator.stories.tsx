import { Meta, StoryObj } from "@storybook/react-vite";

import { Separator } from "./Separator";

const meta = {
  title: "Generic/Seperator",
  component: Separator,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "radio",
      options: ["vertical", "horizontal"]
    }
  },
  decorators: (Story: any) => {
    return (
      <div className="flex w-full max-w-lg justify-center">
        <Story />
      </div>
    );
  }
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="text-foreground">
      <div className="space-y-1">
        <h4 className="text-sm leading-none font-medium">Radix Primitives</h4>
        <p className="text-sm text-muted-foreground">An open-source UI component library.</p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Blog</div>
        <Separator orientation="vertical" />
        <div>Docs</div>
        <Separator orientation="vertical" />
        <div>Source</div>
      </div>
    </div>
  )
};
