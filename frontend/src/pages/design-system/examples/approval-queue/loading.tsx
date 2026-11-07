import {
  ApprovalQueue,
  type ApprovalQueueVariant
} from "@app/components/v4/patterns/approval-queue";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const variants: ApprovalQueueVariant[] = ["framed", "segmented", "divided"];

export default function Example() {
  return (
    <ExampleGrid width="full">
      {variants.map((variant) => (
        <ExampleCell key={variant} label={variant} align="stretch">
          <ApprovalQueue
            variant={variant}
            loading
            loadingRows={2}
            loadingLabel="Loading change requests"
            requests={[]}
            onApprove={() => {}}
            onRetry={() => {}}
          />
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
