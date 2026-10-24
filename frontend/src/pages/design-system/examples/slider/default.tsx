import { useState } from "react";

import { Label } from "@app/components/v4/ui/label";
import { Slider } from "@app/components/v4/ui/slider";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [days, setDays] = useState([30]);
  const [accessWindow, setAccessWindow] = useState([20, 60]);
  return (
    <ExampleGrid width="field">
      <ExampleCell label="Single" align="stretch">
        <div className="flex flex-col gap-2">
          <Label id="slider-retention">Retention: {days[0]} days</Label>
          <Slider
            value={days}
            onValueChange={setDays}
            min={1}
            max={90}
            aria-labelledby="slider-retention"
          />
        </div>
      </ExampleCell>
      <ExampleCell label="Range" align="stretch">
        <div className="flex flex-col gap-2">
          <Label id="slider-window">
            Access window: day {accessWindow[0]} to {accessWindow[1]}
          </Label>
          <Slider
            value={accessWindow}
            onValueChange={setAccessWindow}
            min={0}
            max={90}
            minStepsBetweenThumbs={10}
            thumbLabels={["Access start day", "Access end day"]}
          />
        </div>
      </ExampleCell>
      <ExampleCell label="Disabled" align="stretch">
        <div className="flex flex-col gap-2">
          <Label id="slider-managed">Managed retention: 30 days</Label>
          <Slider value={[30]} min={1} max={90} disabled aria-labelledby="slider-managed" />
        </div>
      </ExampleCell>
    </ExampleGrid>
  );
}
