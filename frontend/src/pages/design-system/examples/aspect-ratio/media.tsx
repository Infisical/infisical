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
                <svg
                  role="img"
                  aria-label="Synthetic connection diagram: application connects to vault"
                  viewBox="0 0 160 90"
                  width="100%"
                  height="100%"
                >
                  <rect
                    x="8"
                    y="25"
                    width="50"
                    height="40"
                    rx="4"
                    fill="none"
                    stroke="currentColor"
                  />
                  <path d="M58 45h40m-8-6 8 6-8 6" fill="none" stroke="currentColor" />
                  <rect
                    x="100"
                    y="25"
                    width="50"
                    height="40"
                    rx="4"
                    fill="none"
                    stroke="currentColor"
                  />
                  <text x="15" y="49" fontSize="10" fill="currentColor">
                    App
                  </text>
                  <text x="110" y="49" fontSize="10" fill="currentColor">
                    Vault
                  </text>
                </svg>
              </div>
            </AspectRatio>
          </ExampleCell>
        </div>
      ))}
    </div>
  );
}
