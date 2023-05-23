// eslint-disable-next-line import/no-extraneous-dependencies
import { faKey, faUser } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// eslint-disable-next-line import/no-extraneous-dependencies
import { Meta, StoryObj } from '@storybook/react';

import { Menu, MenuGroup, MenuItem } from './Menu';

const meta: Meta<typeof Menu> = {
  title: 'Components/Menu',
  component: Menu,
  tags: ['v2'],
  argTypes: {}
};

export default meta;
type Story = StoryObj<typeof Menu>;

export const Basic: Story = {
  render: (args) => (
    <Menu {...args}>
      <MenuItem>Secrets</MenuItem>
      <MenuItem>Members</MenuItem>
      <MenuItem>Integrations</MenuItem>
    </Menu>
  ),
  args: {}
};

export const SelectedItem: Story = {
  render: (args) => (
    <Menu {...args}>
      <MenuItem isSelected>Secrets</MenuItem>
      <MenuItem>Members</MenuItem>
      <MenuItem>Integrations</MenuItem>
    </Menu>
  ),
  args: {}
};

export const GroupedItem: Story = {
  render: (args) => (
    <Menu {...args}>
      <MenuGroup title="Group 1">
        <MenuItem>Secrets</MenuItem>
        <MenuItem>Members</MenuItem>
      </MenuGroup>
      <MenuGroup title="Group 2">
        <MenuItem>Secrets</MenuItem>
        <MenuItem>Members</MenuItem>
      </MenuGroup>
    </Menu>
  ),
  args: {}
};

export const DisabledItem: Story = {
  render: (args) => (
    <Menu {...args}>
      <MenuGroup title="Group 1">
        <MenuItem isDisabled>Secrets</MenuItem>
        <MenuItem>Members</MenuItem>
      </MenuGroup>
      <MenuGroup title="Group 2">
        <MenuItem>Secrets</MenuItem>
        <MenuItem>Members</MenuItem>
      </MenuGroup>
    </Menu>
  ),
  args: {}
};

export const WithIcons: Story = {
  render: (args) => (
    <Menu {...args}>
      <MenuGroup title="Group 1">
        <MenuItem isDisabled icon={<FontAwesomeIcon icon={faKey} />}>
          Secrets
        </MenuItem>
        <MenuItem icon={<FontAwesomeIcon icon={faUser} />}>Members</MenuItem>
      </MenuGroup>
      <MenuGroup title="Group 2">
        <MenuItem icon={<FontAwesomeIcon icon={faKey} />}>Secrets</MenuItem>
        <MenuItem icon={<FontAwesomeIcon icon={faKey} />}>Members</MenuItem>
      </MenuGroup>
    </Menu>
  ),
  args: {}
};

export const WithDescription: Story = {
  render: (args) => (
    <Menu {...args}>
      <MenuItem
        isDisabled
        icon={<FontAwesomeIcon icon={faKey} />}
        description="Some random description"
      >
        Secrets
      </MenuItem>
      <MenuItem icon={<FontAwesomeIcon icon={faUser} />} description="Some random description">
        Members
      </MenuItem>
    </Menu>
  ),
  args: {}
};
