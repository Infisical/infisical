import { useEffect, useState } from "react";

import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from "@app/components/v4/ui/carousel";

import { ExampleCell } from "../../example-presentation";

const updates = ["Staging", "Preview", "Production", "Sandbox"];
export default function Example() {
  const [api, setApi] = useState<CarouselApi>();
  const [position, setPosition] = useState<{ index: number; total: number } | null>(null);
  useEffect(() => {
    if (!api) return undefined;
    const update = () =>
      setPosition({ index: api.selectedScrollSnap() + 1, total: api.scrollSnapList().length });
    update();
    api.on("select", update);
    api.on("reInit", update);
    return () => {
      api.off("select", update);
      api.off("reInit", update);
    };
  }, [api]);
  return (
    <ExampleCell align="stretch" label="4 local environment updates">
      <div className="w-full px-10">
        <Carousel
          aria-label="Multiple visible environment updates"
          setApi={setApi}
          opts={{ align: "start", loop: false }}
        >
          <CarouselContent>
            {updates.map((title) => (
              <CarouselItem key={title} className="basis-1/2" aria-label={`${title} update`}>
                <div className="flex min-h-32 items-center justify-center border border-border p-3 break-words">
                  {title}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
      <p role="status" className="sr-only">
        {position ? `Position ${position.index} of ${position.total}` : "Loading update positions"}
      </p>
    </ExampleCell>
  );
}
