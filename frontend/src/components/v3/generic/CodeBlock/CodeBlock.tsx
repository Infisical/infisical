import { cn } from "@app/components/v3/utils";

import { CopyButton } from "../CopyButton";

type CodeBlockProps = React.ComponentProps<"pre"> & {
  value: string;
  label?: React.ReactNode;
  isCopyable?: boolean;
  isFill?: boolean;
  // Renders in place of value, e.g. syntax-highlighted spans. Copying still uses value.
  children?: React.ReactNode;
};

const CodeBlock = ({
  value,
  label,
  isCopyable = true,
  isFill = false,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const copyAriaLabel = typeof label === "string" ? `Copy ${label.toLowerCase()}` : "Copy code";

  return (
    <div
      data-slot="code-block"
      className={cn(
        "max-w-full min-w-0 overflow-hidden rounded-md border border-border bg-container",
        isFill && "flex min-h-0 flex-1 flex-col"
      )}
    >
      {label && (
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-label">
          {label}
        </div>
      )}
      <div
        className={cn("relative max-w-full min-w-0 overflow-hidden", isFill && "min-h-0 flex-1")}
      >
        <pre
          className={cn(
            "block thin-scrollbar w-full max-w-full overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed whitespace-pre text-foreground",
            isFill && "h-full overflow-y-auto",
            className
          )}
          {...props}
        >
          <code>{children ?? value}</code>
        </pre>
        {isCopyable && (
          <CopyButton
            value={value}
            ariaLabel={copyAriaLabel}
            variant="outline"
            className="absolute top-2 right-2 bg-popover shadow-sm hover:bg-container-hover [&>svg]:size-3"
          />
        )}
      </div>
    </div>
  );
};

export { CodeBlock, type CodeBlockProps };
