import { AspectRatio } from "@app/components/v4/ui/aspect-ratio";

import { ExampleCell } from "../../example-presentation";

const height = 160;

export default function Example() {
  return (
    <div className="flex flex-wrap items-start gap-6">
      {[
        { ratio: 16 / 9, label: "16:9", use: "Recording preview" },
        { ratio: 1, label: "1:1", use: "Square image preview" }
      ].map((item) => (
        <div key={item.label} style={{ width: height * item.ratio }}>
          <ExampleCell align="stretch" label={<>{item.label} width to height</>}>
            <AspectRatio ratio={item.ratio}>
              <div className="flex h-full flex-col items-center justify-center gap-2 border border-border bg-muted p-4 text-center">
                <strong>{item.label}</strong>
                <span className="text-sm">{item.use}</span>
              </div>
            </AspectRatio>
          </ExampleCell>
        </div>
      ))}
    </div>
  );
}
