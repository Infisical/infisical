import type { Meta, StoryObj } from "@storybook/react-vite";

import { FilterableSelect } from "./FilterableSelect";

const meta = {
  title: "Generic/FilterableSelect",
  component: FilterableSelect,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {},
  args: {
    options: [
      { value: "1", label: "Option 1" },
      { value: "2", label: "Option 2" },
      { value: "3", label: "Option 3" }
    ],
    isClearable: true
  },
  decorators: (Story) => {
    return (
      <div className="h-[350px] w-[300px]">
        <Story />
      </div>
    );
  }
} satisfies Meta<typeof FilterableSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExampleSingleValue: Story = {
  name: "Example: Single-Value"
};

export const ExampleMultiValue: Story = {
  name: "Example: Multi-Value",
  args: {
    isMulti: true,
    options: Array.from(Array(20)).map((_, i) => ({ value: i + 1, label: `Option ${i + 1}` }))
  }
};

export const StateIsDisabled: Story = {
  name: "State: isDisabled",
  args: {
    isDisabled: true
  }
};

export const StateIsLoading: Story = {
  name: "State: isLoading",
  args: {
    isLoading: true
  }
};
