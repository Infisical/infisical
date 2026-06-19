import { twMerge } from "tailwind-merge";

import {
  Badge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { AuditLogStreamProduct } from "@app/hooks/api/auditLogStreams/enums";

import { AUDIT_LOG_STREAM_PRODUCT_LABELS } from "../AuditLogStreamForm/AuditLogStreamProductsField";

type Props = {
  products: AuditLogStreamProduct[];
  // Pills rendered inline before collapsing the rest into a "+N" popover.
  maxVisible?: number;
};

const DEFAULT_MAX_VISIBLE = 2;

const ProductBadge = ({
  product,
  className
}: {
  product: AuditLogStreamProduct;
  className?: string;
}) => (
  <Badge variant="neutral" isTruncatable className={twMerge("max-w-[10rem]", className)}>
    {AUDIT_LOG_STREAM_PRODUCT_LABELS[product]}
  </Badge>
);

export const AuditLogStreamProductBadges = ({
  products,
  maxVisible = DEFAULT_MAX_VISIBLE
}: Props) => {
  // No products configured means the stream receives every product.
  if (products.length === 0) {
    return <span className="text-sm text-mineshaft-400">All products</span>;
  }

  // Sort by displayed label so order is stable regardless of how the list was stored.
  const sortedProducts = [...products].sort((a, b) =>
    AUDIT_LOG_STREAM_PRODUCT_LABELS[a].localeCompare(
      AUDIT_LOG_STREAM_PRODUCT_LABELS[b],
      undefined,
      {
        sensitivity: "base"
      }
    )
  );
  const visible = sortedProducts.slice(0, maxVisible);
  const overflow = sortedProducts.slice(maxVisible);

  return (
    <div className="flex items-center gap-1.5">
      {visible.map((product) => (
        <ProductBadge key={product} product={product} />
      ))}
      {overflow.length > 0 && (
        <Popover>
          <Tooltip>
            <TooltipTrigger className="flex h-4 items-center">
              <PopoverTrigger asChild>
                <Badge variant="neutral" asChild>
                  <button type="button" onClick={(e) => e.stopPropagation()}>
                    +{overflow.length}
                  </button>
                </Badge>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Click to view additional products</TooltipContent>
          </Tooltip>
          <PopoverContent
            side="right"
            className="flex w-auto max-w-sm flex-wrap gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {overflow.map((product) => (
              <ProductBadge key={product} product={product} className="z-10" />
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};
