// eslint-disable-next-line
import { useArgs } from "@storybook/client-api";
import type { Meta } from "@storybook/react";

import { Pagination, PaginationProps } from "./Pagination";

const meta: Meta<typeof Pagination> = {
  title: "Components/Pagination",
  component: Pagination,
  tags: ["v2"],
  args: {
    count: 50
  }
};

export default meta;
// type Story = StoryObj<typeof Pagination>;

export const Primary = (args: PaginationProps) => {
  const [, updateArgs] = useArgs();

  return (
    <Pagination
      {...args}
      onChangePage={(page) => updateArgs({ page })}
      onChangePerPage={(perPage) => updateArgs({ perPage, page: 1 })}
    />
  );
};
