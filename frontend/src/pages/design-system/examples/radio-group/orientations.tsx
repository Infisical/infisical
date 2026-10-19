import { Label } from "@app/components/v4/ui/label";
import { RadioGroup, RadioGroupItem } from "@app/components/v4/ui/radio-group";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid>
      {(["horizontal", "vertical"] as const).map((orientation) => (
        <ExampleCell key={orientation} label={orientation}>
          <RadioGroup
            orientation={orientation}
            aria-label={`${orientation} region`}
            defaultValue="west"
          >
            <div className={orientation === "horizontal" ? "flex flex-wrap gap-4" : "space-y-3"}>
              {["west", "east"].map((value) => (
                <div key={value} className="flex items-center gap-3">
                  <RadioGroupItem id={`radio-${orientation}-${value}`} value={value} />
                  <Label htmlFor={`radio-${orientation}-${value}`}>{value}</Label>
                </div>
              ))}
            </div>
          </RadioGroup>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
