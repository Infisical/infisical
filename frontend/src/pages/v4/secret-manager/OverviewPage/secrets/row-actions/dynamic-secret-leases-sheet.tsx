import { useRef, useState } from "react";

import { getDynamicSecretProviderRuntimeMetadata } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/runtimeMetadata";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Inline } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import type { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import type { DynamicSecretResource } from "../flows/dynamic-secret-flow";
import { environmentLabel, Gate } from "../flows/shared";
import {
  DynamicSecretLeaseProvision,
  LEASE_FORM_ID,
  type LeaseRequest,
  type LeaseResult
} from "./dynamic-secret-lease-provision";
import { type DynamicSecretLease, DynamicSecretLeaseList } from "./dynamic-secret-leases";

import styles from "./row-actions.module.css";

const headings: Record<
  "list" | "generate" | "credentials",
  { title: string; description?: string }
> = {
  list: { title: "Leases" },
  generate: { title: "Generate lease" },
  credentials: {
    title: "Lease credentials",
    description: "Shown once. Copy them before you go back."
  }
};

export function DynamicSecretLeasesSheet({
  entry: openEntry,
  provider,
  leases,
  loading,
  onClose,
  onProvision,
  onRenew,
  onRevoke,
  leaseBlock
}: {
  entry?: DynamicSecretResource;
  provider: DynamicSecretProviders;
  leases: readonly DynamicSecretLease[];
  loading: boolean;
  onClose: () => void;
  onProvision: (request: LeaseRequest) => Promise<LeaseResult | undefined>;
  onRenew: (leaseId: string, ttl: string) => void;
  onRevoke: (leaseId: string, isForced: boolean) => void;
  leaseBlock?: string;
}) {
  const lastEntry = useRef(openEntry);
  if (openEntry) lastEntry.current = openEntry;
  const entry = openEntry ?? lastEntry.current;
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<LeaseResult>();
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (!entry) return null;

  const { leaseCapabilities } = getDynamicSecretProviderRuntimeMetadata(provider);
  let view: keyof typeof headings = "list";
  if (generating) view = result ? "credentials" : "generate";
  const startGenerating = () => {
    setResult(undefined);
    setAttempt((value) => value + 1);
    setGenerating(true);
  };
  const backToList = () => {
    setGenerating(false);
    setResult(undefined);
  };
  const provision = (request: LeaseRequest) => {
    setPending(true);
    onProvision(request)
      .then((next) => next && setResult(next))
      .finally(() => setPending(false));
  };

  let footer;
  if (view === "list" && !loading && leases.length > 0)
    footer = (
      <Gate reason={leaseBlock}>
        <Button disabled={Boolean(leaseBlock)} onClick={startGenerating}>
          Generate lease
        </Button>
      </Gate>
    );
  if (view === "generate" && !leaseCapabilities.autoGenerate)
    footer = (
      <>
        <Button variant="ghost" onClick={backToList}>
          Back
        </Button>
        <Button type="submit" form={LEASE_FORM_ID} loading={pending}>
          Generate lease
        </Button>
      </>
    );
  if (view === "credentials") footer = <Button onClick={backToList}>Back to leases</Button>;

  return (
    <Sheet
      open={Boolean(openEntry)}
      onOpenChange={(next) => {
        if (next) return;
        backToList();
        onClose();
      }}
    >
      <SheetContent size="lg" pending={pending}>
        <SheetHeader>
          <SheetTitle>{headings[view].title}</SheetTitle>
          {headings[view].description && (
            <SheetDescription>{headings[view].description}</SheetDescription>
          )}
        </SheetHeader>
        <SheetSubheader className={styles.subject}>
          <span className={styles.subjectName}>{entry.name}</span>
          <Badge tone="outline">{environmentLabel(entry.environment)}</Badge>
        </SheetSubheader>
        <SheetBody>
          {view === "list" ? (
            <DynamicSecretLeaseList
              entry={entry}
              leases={leases}
              loading={loading}
              canRenew={leaseCapabilities.supportsRenewal}
              onGenerate={startGenerating}
              onRenew={onRenew}
              onRevoke={onRevoke}
              leaseBlock={leaseBlock}
            />
          ) : (
            <DynamicSecretLeaseProvision
              key={attempt}
              provider={provider}
              result={result}
              onProvision={provision}
            />
          )}
        </SheetBody>
        {footer && (
          <SheetFooter>
            <Inline gap={8} justify="end">
              {footer}
            </Inline>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
