import { Inline } from "@app/components/v4/ui/layout";
import { MiddleTruncate } from "@app/components/v4/ui/middle-truncate";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { CopyButton } from "../access/org/detail-parts";

export const TruncatedValue = ({ value, copyLabel }: { value: string; copyLabel?: string }) => (
  <Inline gap={4} align="center" wrap={false}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <Tooltip content={<code>{value}</code>} side="top">
        <MiddleTruncate mono keepEnd={6} text={value} title={false} tabIndex={0} />
      </Tooltip>
    </div>
    {copyLabel && <CopyButton value={value} label={copyLabel} />}
  </Inline>
);
