import * as React from "react";

import { Pagination } from "@app/components/v4/ui/pagination";

import { ExampleCell, ExampleStack } from "../../example-presentation";

export default function PaginationExamples() {
  const [page, setPage] = React.useState(2);
  const [size, setSize] = React.useState(25);
  const [shown, setShown] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ExampleStack>
      <ExampleCell label="numbered" align="stretch">
        <Pagination
          label="Secrets pages"
          page={page}
          onPageChange={setPage}
          total={412}
          pageSize={size}
          pageSizeOptions={[10, 25, 50]}
          onPageSizeChange={setSize}
        />
      </ExampleCell>
      <ExampleCell label="compact" align="stretch">
        <Pagination label="Audit log pages" variant="compact" pageCount={8} defaultPage={3} />
      </ExampleCell>
      <ExampleCell label="more" align="stretch">
        <Pagination
          label="Activity pages"
          variant="more"
          page={shown}
          total={60}
          pageSize={25}
          loading={loading}
          onLoadMore={() => {
            setLoading(true);
            timer.current = setTimeout(() => {
              setShown((current) => current + 1);
              setLoading(false);
            }, 700);
          }}
        />
      </ExampleCell>
    </ExampleStack>
  );
}
