import type { ReactNode } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Inline } from "@infisical/cipher/ui/layout";
import { Meta } from "@infisical/cipher/ui/text";

// Stand-in: Cipher's DataTable draws its load more as an outline button inside the table, with no way to
// hand it to a Card's frame footer, so cards and lists compose the quiet footer here until it ships one.
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
