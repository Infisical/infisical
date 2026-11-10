import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/sonner";
import { toast } from "@app/components/v4/ui/sonner";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <div className="flex flex-wrap items-center gap-3">
        <UI.Toaster />
        <Button
          onClick={() =>
            toast.success("Changes saved", {
              description: "New versions are available to clients."
            })
          }
        >
          Show success toast
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.error("Connection failed", { description: "Reconnect before retrying." })
          }
        >
          Show failure
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.warning("Sync paused", {
              description:
                "Vercel rejected the last three pushes. Secrets stay on the previous version until you reconnect the integration and retry the sync."
            })
          }
        >
          Show warning
        </Button>
        <Button variant="outline" onClick={() => toast.info("Version available")}>
          Show notice
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.success("Secret deleted", {
              description: "DATABASE_URL was removed from Production.",
              action: { label: "Undo", onClick: () => toast.success("Secret restored") }
            })
          }
        >
          Show with action
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const id = toast.loading("Checking provider");
            window.setTimeout(() => toast.success("Provider connected", { id }), 1800);
          }}
        >
          Show loading
        </Button>
      </div>
    </ExampleStack>
  );
}
