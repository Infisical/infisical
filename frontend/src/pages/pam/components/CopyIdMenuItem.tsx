import { Copy } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DropdownMenuItem } from "@app/components/v3";

export const CopyIdMenuItem = ({ id }: { id: string }) => (
  <DropdownMenuItem
    onClick={async () => {
      await navigator.clipboard.writeText(id);
      createNotification({ type: "success", text: "ID copied to clipboard" });
    }}
  >
    <Copy />
    Copy ID
  </DropdownMenuItem>
);
