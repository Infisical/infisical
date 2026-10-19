import { AppWindow, ArrowRight, Vault } from "lucide-react";

import { AspectRatio } from "@app/components/v4/ui/aspect-ratio";

import { ExampleCell } from "../../example-presentation";

const height = 160;

export default function Example() {
  return (
    <div className="flex flex-wrap items-start gap-6">
      {[
        { ratio: 16 / 9, label: "16:9" },
        { ratio: 1, label: "1:1" },
        { ratio: 3 / 4, label: "3:4" }
      ].map(({ ratio, label }) => (
        <div key={label} style={{ width: height * ratio }}>
          <ExampleCell align="stretch" label={label}>
            <AspectRatio ratio={ratio}>
              <div className="h-full border border-border bg-muted">
                <div
                  role="img"
                  aria-label="Synthetic connection diagram: application connects to vault"
                  className="flex h-full items-center justify-center gap-3"
                >
                  <AppWindow className="size-6" strokeWidth={1.7} aria-hidden />
                  <ArrowRight className="size-4" strokeWidth={1.7} aria-hidden />
                  <Vault className="size-6" strokeWidth={1.7} aria-hidden />
                </div>
              </div>
            </AspectRatio>
          </ExampleCell>
        </div>
      ))}
    </div>
  );
}
