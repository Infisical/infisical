import { AlertTriangleIcon, CheckIcon, ClockIcon, InfoIcon, OctagonXIcon } from "lucide-react";

import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  RotationVerdict,
  TRotationSimulation,
  TRotationSimulationItem
} from "@app/hooks/api/blastRadius";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  simulation?: TRotationSimulation;
  isPending: boolean;
};

const VERDICT_ICON: Record<RotationVerdict, typeof CheckIcon> = {
  [RotationVerdict.Red]: OctagonXIcon,
  [RotationVerdict.Amber]: AlertTriangleIcon,
  [RotationVerdict.Green]: CheckIcon
};

const VERDICT_TONE: Record<RotationVerdict, string> = {
  [RotationVerdict.Red]: "text-danger",
  [RotationVerdict.Amber]: "text-warning",
  [RotationVerdict.Green]: "text-success"
};

const ItemList = ({
  title,
  items,
  tone,
  icon
}: {
  title: string;
  items: TRotationSimulationItem[];
  tone: string;
  icon: React.ReactNode;
}) => {
  if (!items.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs tracking-wide text-accent uppercase">
        {icon}
        {title} · {items.length}
      </span>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-sm border border-border">
        {items.map((item) => (
          <li key={`${item.code}-${item.message}`} className="flex gap-2 bg-container p-2.5">
            <span className={cn("mt-0.5 text-xs leading-none", tone)}>■</span>
            <p className="text-xs leading-snug text-foreground">{item.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const RotationSimulationModal = ({ isOpen, onOpenChange, simulation, isPending }: Props) => {
  const VerdictIcon = simulation ? VERDICT_ICON[simulation.verdict] : InfoIcon;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Simulate Rotation</DialogTitle>
          <DialogDescription>
            {simulation
              ? `${simulation.secret.key} · dry run`
              : "Working out what depends on this value."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {isPending || !simulation ? (
            <>
              <Skeleton className="h-14" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <span
                  className={cn(
                    "flex items-center gap-2 text-base font-medium",
                    VERDICT_TONE[simulation.verdict]
                  )}
                >
                  <VerdictIcon size={16} />
                  {simulation.headline}
                </span>
                <p className="text-xs text-accent">{simulation.subheadline}</p>
              </div>

              {/* Both halves matter: the risk of acting, and the risk of not acting. A reader who
                  only sees the blocking list will correctly conclude "do nothing", which is wrong
                  when the value is also years old and known to people who left. */}
              <ItemList
                title="Why it is overdue anyway"
                items={simulation.reasonsToRotate}
                tone="text-warning"
                icon={<ClockIcon />}
              />
              <ItemList
                title="Will break"
                items={simulation.impacts}
                tone="text-danger"
                icon={<OctagonXIcon />}
              />
              <ItemList
                title="Worth knowing"
                items={simulation.worthKnowing}
                tone="text-info"
                icon={<InfoIcon />}
              />
              <ItemList
                title="Will update automatically"
                items={simulation.willUpdateAutomatically}
                tone="text-success"
                icon={<CheckIcon />}
              />

              {!simulation.consumptionAvailable && (
                <Badge variant="neutral" className="w-fit">
                  Read activity is hidden for your role, so consumer impact is not included.
                </Badge>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {simulation?.impacts.length ? (
            <p className="mr-auto text-xs text-muted">
              Fix the {simulation.impacts.length} blocking{" "}
              {simulation.impacts.length === 1 ? "item" : "items"} before rotating.
            </p>
          ) : null}
          <Button size="xs" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
