import type { ReactNode } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Inline } from "@infisical/cipher/ui/layout";
import { Meta } from "@infisical/cipher/ui/text";

// Stand-in: Cipher's quiet show more footer lives inside DataTable only, so Lists and other
// non-table collections compose the same count and Show more here until Cipher ships one for them.
export const ShowMoreFooter = ({
  status,
  label = "Show more",
  loading,
  onShowMore
}: {
  status?: ReactNode;
  label?: string;
  loading?: boolean;
  onShowMore?: () => void;
}) => (
  <Inline gap={12} align="center" justify="between" wrap={false} style={{ width: "100%" }}>
    <Meta mono={false}>{status}</Meta>
    {onShowMore && (
      <Button variant="ghost" loading={loading} onClick={onShowMore}>
        {label}
      </Button>
    )}
  </Inline>
);
