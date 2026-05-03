import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Pagination } from "./Pagination";

/**
 * `Pagination` is the v3 page-controls component — first / prev / next / last
 * buttons plus a per-page dropdown and a "1 – 10 of 142" range readout. Wire
 * it up by passing the total `count`, the current `page`, and the
 * `onChangePage` / `onChangePerPage` callbacks; the component derives bounds
 * (can-go-prev, can-go-last, etc.) automatically and disables the chevrons
 * when there is nowhere to go.
 *
 * Reach for `Pagination` as a sibling directly below a `Table`, `DataGrid`,
 * or any list whose dataset doesn't fit on a single screen — see
 * *Generic / Table → Example: With Pagination* for the canonical pairing.
 */
const meta = {
  title: "Generic/Pagination",
  component: Pagination,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    count: {
      control: { type: "number", min: 0 }
    },
    page: {
      control: { type: "number", min: 1 }
    },
    perPage: {
      control: { type: "number" }
    }
  },
  args: {
    count: 142,
    page: 1,
    perPage: 10,
    onChangePage: () => {},
    onChangePerPage: () => {}
  },
  decorators: [
    (Story) => (
      <div className="w-[600px]">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

function PaginationRender({
  initialCount = 142,
  initialPerPage = 10,
  perPageList
}: {
  initialCount?: number;
  initialPerPage?: number;
  perPageList?: number[];
}) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);
  return (
    <Pagination
      count={initialCount}
      page={page}
      perPage={perPage}
      onChangePage={setPage}
      onChangePerPage={(next) => {
        setPerPage(next);
        setPage(1);
      }}
      perPageList={perPageList}
    />
  );
}

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Baseline pagination over 142 rows at 10 per page. Use the chevrons to step or jump to first / last; open the dropdown to change the per-page count. Wire `onChangePage` and `onChangePerPage` to your data fetcher (server-side) or your client-side slice."
      }
    }
  },
  render: () => <PaginationRender />
};

export const FewRows: Story = {
  name: "State: Single Page",
  parameters: {
    docs: {
      description: {
        story:
          "When the total `count` fits on a single page, the chevrons render disabled and the readout shows the full set ('1 – 8 of 8'). The component still renders so the per-page dropdown stays reachable for users who want to switch density."
      }
    }
  },
  render: () => <PaginationRender initialCount={8} />
};

export const CustomPerPageList: Story = {
  name: "Variant: Custom Per-Page List",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `perPageList` to override the default options (`[10, 20, 50, 100]`). Use larger steps for dense data (audit logs, secret diffs) and smaller steps for visually heavy rows (cards, expandable items). The initial `perPage` should be one of the values in the list."
      }
    }
  },
  render: () => (
    <PaginationRender initialPerPage={25} perPageList={[25, 50, 100, 250]} initialCount={500} />
  )
};

function StartAdornmentRender() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  return (
    <Pagination
      count={142}
      page={page}
      perPage={perPage}
      onChangePage={setPage}
      onChangePerPage={(next) => {
        setPerPage(next);
        setPage(1);
      }}
      startAdornment={<span className="text-xs text-muted">3 selected</span>}
    />
  );
}

export const WithStartAdornment: Story = {
  name: "Example: With Start Adornment",
  parameters: {
    docs: {
      description: {
        story:
          "Pass a node to `startAdornment` to render content on the leading edge of the controls — typically a selection count, a filter summary, or a bulk-action button strip. The pagination block pushes itself to the trailing edge so the adornment owns the start."
      }
    }
  },
  render: () => <StartAdornmentRender />
};
