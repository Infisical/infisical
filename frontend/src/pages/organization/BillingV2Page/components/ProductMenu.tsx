import { useRef, useState } from "react";
import { EllipsisIcon } from "lucide-react";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Popover,
  PopoverAnchor,
  PopoverContent
} from "@app/components/v3";
import { BillingV2CatalogProduct } from "@app/hooks/api";

import { byDisplayOrder } from "../billing-v2-format";

export const ProductMenu = ({
  prod,
  currentTier,
  canChangePlan,
  hasBreakdown,
  commitmentLabel,
  onManage,
  onSetCommitment,
  onViewBreakdown
}: {
  prod: BillingV2CatalogProduct;
  currentTier?: string;
  canChangePlan: boolean;
  hasBreakdown: boolean;
  commitmentLabel?: string | null;
  onManage: (productId: string) => void;
  onSetCommitment?: () => void;
  onViewBreakdown?: () => void;
}) => {
  const [showPlans, setShowPlans] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openPlansOnCloseRef = useRef(false);
  const plans = prod.plans
    .filter((plan) => !plan.deprecated || plan.tier === currentTier)
    .sort(byDisplayOrder);
  const showViewPlans = !canChangePlan && plans.length > 0;
  if (!canChangePlan && !hasBreakdown && !showViewPlans) return null;

  return (
    <Popover open={showPlans} onOpenChange={setShowPlans}>
      <DropdownMenu>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            <IconButton
              ref={triggerRef}
              aria-label={`${prod.name} actions`}
              size="xs"
              variant="ghost-muted"
            >
              <EllipsisIcon />
            </IconButton>
          </DropdownMenuTrigger>
        </PopoverAnchor>
        <DropdownMenuContent
          align="end"
          sideOffset={2}
          onCloseAutoFocus={(event) => {
            if (openPlansOnCloseRef.current) {
              event.preventDefault();
              openPlansOnCloseRef.current = false;
              setShowPlans(true);
            }
          }}
        >
          {canChangePlan && (
            <DropdownMenuItem onClick={() => onManage(prod.id)}>Manage Plan</DropdownMenuItem>
          )}
          {canChangePlan && commitmentLabel && onSetCommitment && (
            <DropdownMenuItem onClick={onSetCommitment}>{commitmentLabel}</DropdownMenuItem>
          )}
          {canChangePlan && hasBreakdown && <DropdownMenuSeparator />}
          {hasBreakdown && onViewBreakdown && (
            <DropdownMenuItem onClick={onViewBreakdown}>View Usage Breakdown</DropdownMenuItem>
          )}
          {showViewPlans && (
            <DropdownMenuItem
              onSelect={() => {
                openPlansOnCloseRef.current = true;
              }}
            >
              View Plans
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <PopoverContent
        align="end"
        aria-label={`${prod.name} plans`}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (document.activeElement === document.body) triggerRef.current?.focus();
        }}
      >
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">{prod.name} plans</span>
          {plans.map((plan) => (
            <div key={plan.tier} className="flex items-center justify-between gap-3">
              <span className="text-sm">{plan.name}</span>
              {plan.tier === currentTier && <Badge variant="neutral">Current</Badge>}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
