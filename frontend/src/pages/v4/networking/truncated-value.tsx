import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { CopyValue } from "@infisical/cipher/ui/sensitive-editor";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

export const TruncatedValue = ({ value, copyLabel }: { value: string; copyLabel?: string }) => {
  const text = (
    <Tooltip content={<code>{value}</code>} side="top">
      <MiddleTruncate mono keepEnd={6} text={value} title={false} tabIndex={0} />
    </Tooltip>
  );
  if (!copyLabel) return <div style={{ minWidth: 0 }}>{text}</div>;
  return (
    <CopyValue value={value} label={copyLabel}>
      {text}
    </CopyValue>
  );
};
