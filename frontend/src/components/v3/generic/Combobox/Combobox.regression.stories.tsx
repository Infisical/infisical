import type { Meta, StoryObj } from "@storybook/react-vite";

import { Combobox } from "./Combobox";
import {
  ComboboxStoryFrame,
  DismissedPendingCreation as DismissedPendingCreationStory,
  OpaqueOptionFields as OpaqueOptionFieldsStory,
  PreserveNewQueryDuringCreation as PreserveNewQueryDuringCreationStory,
  ServerFilteredSelection as ServerFilteredSelectionStory,
  SingleDismissedFailure as SingleDismissedFailureStory,
  UnmountedPendingCreation as UnmountedPendingCreationStory,
  ValidatedCreation as ValidatedCreationStory,
  ViewportEdges as ViewportEdgesStory
} from "./Combobox.stories";

const meta = {
  title: "Generic/Combobox/Regression",
  component: Combobox,
  parameters: {
    layout: "centered",
    docs: { disable: true }
  },
  tags: ["!autodocs"],
  decorators: [
    (Story, context) => (
      <ComboboxStoryFrame fullscreen={context.parameters.layout === "fullscreen"}>
        <Story />
      </ComboboxStoryFrame>
    )
  ],
  globals: {
    backgrounds: { value: "card" }
  }
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj;

export const OpaqueOptionFields: Story = { ...OpaqueOptionFieldsStory };
export const ViewportEdges: Story = { ...ViewportEdgesStory };
export const ServerFilteredSelection: Story = { ...ServerFilteredSelectionStory };
export const SingleDismissedFailure: Story = { ...SingleDismissedFailureStory };
export const DismissedPendingCreation: Story = { ...DismissedPendingCreationStory };
export const PreserveNewQueryDuringCreation: Story = {
  ...PreserveNewQueryDuringCreationStory
};
export const UnmountedPendingCreation: Story = { ...UnmountedPendingCreationStory };
export const ValidatedCreation: Story = { ...ValidatedCreationStory };
