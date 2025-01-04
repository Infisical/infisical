import type { Meta, StoryObj } from "@storybook/react";

import { Table, TableContainer, TableSkeleton, TBody, Td, Th, THead, Tr } from "./Table";

const meta: Meta<typeof Table> = {
  title: "Components/Table",
  component: Table,
  tags: ["v2"],
  argTypes: {}
};

export default meta;
type Story = StoryObj<typeof Table>;

export const Basic: Story = {
  render: (args) => (
    <TableContainer>
      <Table {...args}>
        <THead>
          <Tr>
            <Th>Head#1</Th>
            <Th>Head#2</Th>
            <Th>Head#3</Th>
          </Tr>
        </THead>
        <TBody>
          <Tr>
            <Td>Row#1</Td>
            <Td>Row#2</Td>
            <Td>Row#3</Td>
          </Tr>
          <Tr>
            <Td>Row#1</Td>
            <Td>Row#2</Td>
            <Td>Row#3</Td>
          </Tr>
        </TBody>
      </Table>
    </TableContainer>
  )
};

export const Loading: Story = {
  render: (args) => (
    <TableContainer>
      <Table {...args}>
        <THead>
          <Tr>
            <Th>Head#1</Th>
            <Th>Head#2</Th>
            <Th>Head#3</Th>
          </Tr>
        </THead>
        <TBody>
          <TableSkeleton columns={3} innerKey="story-book-table" />
        </TBody>
      </Table>
    </TableContainer>
  )
};
