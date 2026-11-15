import { cn } from "@app/components/v3/utils";

import { CopyButton } from "../CopyButton";

type CodeBlockProps = React.ComponentProps<"pre"> & {
  value: string;
  label?: React.ReactNode;
  isCopyable?: boolean;
  // Renders in place of value, e.g. syntax-highlighted spans. Copying still uses value.
  children?: React.ReactNode;
};

const CodeBlock = ({
  value,
  label,
  isCopyable = true,
  className,
  children,
  ...props
}: CodeBlockProps) => (
  <div
    data-slot="code-block"
    className="max-w-full min-w-0 overflow-hidden rounded-md border border-border bg-container"
  >
    {label && (
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-label">{label}</div>
    )}
    <div className="relative max-w-full min-w-0 overflow-hidden">
      <pre
        className={cn(
          "block thin-scrollbar w-full max-w-full overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed whitespace-pre text-foreground",
          className
        )}
        {...props}
      >
        <code>{children ?? value}</code>
      </pre>
      {isCopyable && (
        <CopyButton
          value={value}
          ariaLabel={typeof label === "string" ? `Copy ${label.toLowerCase()}` : "Copy code"}
          variant="outline"
          className="absolute top-2 right-2 bg-popover shadow-sm hover:bg-container-hover [&>svg]:size-3"
        />
      )}
    </div>
  </div>
);

export { CodeBlock, type CodeBlockProps };
