import { toast } from "sonner";

import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/sonner";

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
      </div>
    </ExampleStack>
  );
}
