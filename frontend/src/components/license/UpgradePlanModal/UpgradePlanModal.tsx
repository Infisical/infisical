import { Link } from "@tanstack/react-router";
import { SparklesIcon } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useScopeVariant } from "@app/hooks";

type Props = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  text: string;
  // akhilmhdh: We will come back to this late. Otherwise would need to change in a lot of places.
  // eslint-disable-next-line
  isEnterpriseFeature?: boolean;
};

export const UpgradePlanModal = ({ text, isOpen, onOpenChange }: Props): JSX.Element => {
  const { currentOrg } = useOrganization();
  const scopeVariant = useScopeVariant();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/* Keep upgrade prompts above the dialog or sheet that triggered them. */}
      <DialogContent className="z-[70] sm:max-w-xl" overlayClassName="z-[70]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <SparklesIcon className="size-5 text-muted" />
            Unleash Infisical&apos;s Full Power
          </DialogTitle>
          <DialogDescription>
            Upgrade and get access to this, as well as to other powerful enhancements.
          </DialogDescription>
        </DialogHeader>

        <Separator />
        <p className="text-sm leading-relaxed text-foreground">{text}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange?.(false)}>
            Cancel
          </Button>
          <Link to="/organizations/$orgId/billing" params={{ orgId: currentOrg.id }}>
            <Button variant={scopeVariant}>Upgrade Plan</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
