import { faPlus, faTrash, faUndo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Meta, StoryObj } from "@storybook/react";

import { IconButton } from "../IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./Dropdown";

const meta: Meta<typeof DropdownMenu> = {
  title: "Components/DropdownMenu",
  component: DropdownMenu,
  tags: ["v2"],
  argTypes: {}
};

export default meta;
type Story = StoryObj<typeof DropdownMenuContent>;

export const Basic: Story = {
  render: (args) => (
    <div className="flex justify-center w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton ariaLabel="add">
            <FontAwesomeIcon icon={faPlus} />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" {...args}>
          <DropdownMenuItem>Delete</DropdownMenuItem>
          <DropdownMenuItem>Undo</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
};

export const Icons: Story = {
  render: (args) => (
    <div className="flex justify-center w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton ariaLabel="add">
            <FontAwesomeIcon icon={faPlus} />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" {...args}>
          <DropdownMenuItem icon={<FontAwesomeIcon icon={faTrash} size="sm" />}>
            Delete
          </DropdownMenuItem>
          <DropdownMenuItem icon={<FontAwesomeIcon icon={faUndo} size="sm" />}>
            Undo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
};

export const WithDivider: Story = {
  render: (args) => (
    <div className="flex justify-center w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton ariaLabel="add">
            <FontAwesomeIcon icon={faPlus} />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" {...args}>
          <DropdownMenuItem>Delete</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Undo</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Redo</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
};

export const Group: Story = {
  render: (args) => (
    <div className="flex justify-center w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton ariaLabel="add">
            <FontAwesomeIcon icon={faPlus} />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" {...args}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Group</DropdownMenuLabel>
            <DropdownMenuItem>Undo</DropdownMenuItem>
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Group#2</DropdownMenuLabel>
            <DropdownMenuItem>Undo</DropdownMenuItem>
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
};
