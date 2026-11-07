import { useEffect, useId, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { type ToastItem, ToastStack } from "@app/components/v4/ui/sonner";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const tones = {
  neutral: { id: "neutral", title: "Version available", tone: "neutral" },
  ok: { id: "ok", title: "Changes saved", tone: "ok" },
  bad: { id: "bad", title: "Connection failed", tone: "bad" },
  loading: { id: "loading", title: "Checking provider", tone: "loading" }
} satisfies Record<string, ToastItem>;

const resolved = { id: "loading", title: "Provider connected", tone: "ok" } satisfies ToastItem;

const ToneDemo = ({ tone }: { tone: keyof typeof tones }) => {
  const regionId = useId();
  const [item, setItem] = useState<ToastItem | null>(null);
  useEffect(() => {
    if (item?.tone !== "loading") return undefined;
    const timer = window.setTimeout(() => setItem(resolved), 1800);
    return () => window.clearTimeout(timer);
  }, [item]);
  return (
    <div className="flex w-full flex-col items-start gap-3">
      <Button
        variant="outline"
        aria-controls={regionId}
        onClick={() => setItem({ ...tones[tone], duration: 0 })}
      >
        Show {tone} notice
      </Button>
      <div id={regionId} className="min-h-14 w-full">
        {item && <ToastStack inline items={[item]} onDismiss={() => setItem(null)} />}
      </div>
    </div>
  );
};

export default function Example() {
  return (
    <ExampleGrid width="wide">
      {(Object.keys(tones) as (keyof typeof tones)[]).map((tone) => (
        <ExampleCell align="stretch" key={tone} label={tone}>
          <ToneDemo tone={tone} />
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
