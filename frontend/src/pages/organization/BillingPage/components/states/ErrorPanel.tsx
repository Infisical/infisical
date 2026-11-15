import { CircleAlert, RefreshCw } from "lucide-react";

import { Button, Card } from "@app/components/v3";

// Shown when the billing service can't be reached; the customer's products are unaffected.
export const ErrorPanel = ({ onRetry }: { onRetry: () => void }) => (
  <Card>
    <div className="flex flex-col items-center gap-3 px-7 py-10 text-center">
      <CircleAlert className="size-8 text-danger" />
      <div className="text-base font-semibold text-foreground">
        Couldn&apos;t load your subscription
      </div>
      <div className="max-w-[40ch] text-sm text-accent">
        There was a problem reaching the billing service. Your products are unaffected.
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw />
        Try again
      </Button>
    </div>
  </Card>
);
