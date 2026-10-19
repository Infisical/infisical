import { useState } from "react";

import { List, ListRow, ListSection } from "@app/components/v4/ui/list";

import { ExampleCell } from "../example-presentation";

export default function Example() {
  const [selected, setSelected] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  return (
    <ExampleCell align="stretch" label="Multiple selection and row states">
      <List
        label="Access requests"
        title="Requests"
        selection="multiple"
        selectedIds={selected}
        onSelectionChange={setSelected}
        footer={`${selected.length} selected`}
      >
        <ListSection label="Today" meta="3">
          <ListRow
            value="new"
            title="Unread request"
            label="Unread request"
            unread
            description="Read access requested for the staging environment."
            meta="2m"
            current={current === "new"}
            onClick={() => setCurrent("new")}
          />
          <ListRow
            value="done"
            title="Resolved request"
            label="Resolved request"
            resolved
            meta="1h"
          />
          <ListRow
            value="owner"
            title="Project owner"
            label="Project owner"
            selectable={false}
            description="Transfer ownership to remove"
          />
        </ListSection>
      </List>
    </ExampleCell>
  );
}
