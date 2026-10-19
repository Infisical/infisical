# Carousel

Browse a finite set of related panels with explicit previous and next controls.

## Choose this component

Choose Carousel for optional browsing through a bounded set of previews. Use a list or grid when people must compare items or complete every step.

## Usage rules

### carousel-usage

Owner: carousel.

When not all preview slides fit at once.

Do: Keep Previous and Next controls visible and identify the current slide or item.

Avoid: Put a required input or the only recovery action on an offscreen slide.

Why: Hidden slides are easy to miss and make task completion depend on discovery.

Checked by: review only. Look for: Use only keyboard and visible previous/next controls to inspect every slide; end controls report their boundaries and no required task depends on an unseen slide.

Source evidence:
- src/components/v4/ui/carousel.tsx
- src/pages/design-system/examples/carousel/default.tsx

## State guidance

- boundary: Disable unavailable previous or next actions at the ends.
- narrow: Keep controls within the available layout and preserve access to slide content.

## Presentation rules

Do: Use manual navigation for optional preview media.

Avoid: Auto-advance a resource or setup carousel on a timer.

Why: Automatic movement changes reading and focus context without a request.

## Import and exports

- src/components/v4/ui/carousel.tsx

Exports: Carousel, CarouselApi, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, useCarousel. Source TypeScript defines the API.

## Behavior

- Embla owns scroll position and reports its API through setApi. orientation chooses horizontal or vertical movement; previous/next disabled state follows the current scroll bounds.

## Accessibility

- The wrapper and slides expose carousel/slide descriptions. Arrow handling follows orientation and leaves editable fields, composite controls and modified keys alone; navigation buttons remain explicit.

## Use cases

- Show an honest empty result, derive position and previous/next availability from the carousel API, and keep all essential information outside hidden slides.

## Avoid

- Invent a slide count, enable an action past a nonlooping bound or place required form steps in slides.

## Limits

- Autoplay is not enabled by the wrapper; any supplied plugin and its pause controls belong to the host.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### orientation

- horizontal: example `default`, visible label "Environment history".
- vertical: omitted. Vertical movement swaps the scroll axis and the control positions; it adds no behavior the horizontal examples hide.

### loop

- true: example `default`, visible label "Environment history".
- false: example `multiple`, visible label "4 local environment updates".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

### visible slides

- one: example `default`, visible label "Environment history".
- multiple: example `multiple`, visible label "4 local environment updates".

### host item count

- multiple: example `multiple`, visible label "4 local environment updates".
- zero: omitted. The host decides what an empty collection shows; the carousel renders its own slides only.
- single: omitted. A single slide is the multiple-slide case with nothing to scroll to.

### position source

- selected API snap: example `multiple`, visible label "Position 1 of 3".

## Executable examples

### Manual slide navigation

Save this example at `src/pages/design-system/examples/carousel/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/carousel. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as UI from "../../../../components/v4/ui/carousel";
export default function Example() {
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <div className="w-full px-10">
        <UI.Carousel aria-label="Release updates" opts={{ loop: true }}>
          <UI.CarouselContent>
            {["Environment history", "Connection status", "Review requests"].map((title) => (<UI.CarouselItem key={title}>
                <div className="flex min-h-32 items-center justify-center rounded-sm border border-border p-4">
                  {title}
                </div>
              </UI.CarouselItem>))}
          </UI.CarouselContent>
          <UI.CarouselPrevious />
          <UI.CarouselNext />
        </UI.Carousel>
      </div>
    </div><figcaption className="text-muted-foreground text-xs">{"Environment history"}</figcaption></figure>);
}
```

### Multiple visible updates and current position

Save this example at `src/pages/design-system/examples/carousel/multiple.tsx`; its relative imports are generated for that exact path. States: default, keyboard.

Registry items used: @infisical/carousel. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useEffect, useState } from "react";
import { Carousel, type CarouselApi, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "../../../../components/v4/ui/carousel";
const updates = ["Staging", "Preview", "Production", "Sandbox"];
export default function Example() {
    const [api, setApi] = useState<CarouselApi>();
    const [position, setPosition] = useState<{
        index: number;
        total: number;
    } | null>(null);
    useEffect(() => {
        if (!api)
            return undefined;
        const update = () => setPosition({ index: api.selectedScrollSnap() + 1, total: api.scrollSnapList().length });
        update();
        api.on("select", update);
        api.on("reInit", update);
        return () => {
            api.off("select", update);
            api.off("reInit", update);
        };
    }, [api]);
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <div className="w-full px-10">
        <Carousel aria-label="Multiple visible environment updates" setApi={setApi} opts={{ align: "start", loop: false }}>
          <CarouselContent>
            {updates.map((title) => (<CarouselItem key={title} className="basis-1/2" aria-label={`${title} update`}>
                <div className="flex min-h-32 items-center justify-center border border-border p-3 break-words">
                  {title}
                </div>
              </CarouselItem>))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
      <p role="status" className="sr-only">
        {position ? `Position ${position.index} of ${position.total}` : "Loading update positions"}
      </p>
    </div><figcaption className="text-muted-foreground text-xs">{"4 local environment updates"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#carousel and verify the documented interaction.
