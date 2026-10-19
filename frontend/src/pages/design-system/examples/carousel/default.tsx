import * as UI from "@app/components/v4/ui/carousel";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleCell align="stretch" label="Environment history">
      <div className="w-full px-10">
        <UI.Carousel aria-label="Release updates" opts={{ loop: true }}>
          <UI.CarouselContent>
            {["Environment history", "Connection status", "Review requests"].map((title) => (
              <UI.CarouselItem key={title}>
                <div className="flex min-h-32 items-center justify-center rounded-sm border border-border p-4">
                  {title}
                </div>
              </UI.CarouselItem>
            ))}
          </UI.CarouselContent>
          <UI.CarouselPrevious />
          <UI.CarouselNext />
        </UI.Carousel>
      </div>
    </ExampleCell>
  );
}
