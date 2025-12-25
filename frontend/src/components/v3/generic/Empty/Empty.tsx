import { cn } from "../../utils";

function UnstableEmpty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-md border-dashed border-border bg-container p-6 text-center text-balance md:p-12",
        className
      )}
      {...props}
    />
  );
}

function UnstableEmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-sm flex-col items-center gap-2 text-center", className)}
      {...props}
    />
  );
}

// scott: TODO

// const emptyMediaVariants = cva(
//   "flex shrink-0 items-center justify-center mb-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
//   {
//     variants: {
//       variant: {
//         default: "bg-transparent",
//         icon: "bg-bunker-900 rounded text-foreground flex size-10 shrink-0 items-center justify-center [&_svg:not([class*='size-'])]:size-6"
//       }
//     },
//     defaultVariants: {
//       variant: "default"
//     }
//   }
// );

// function EmptyMedia({
//   className,
//   variant = "default",
//   ...props
// }: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
//   return (
//     <div
//       data-slot="empty-icon"
//       data-variant={variant}
//       className={cn(emptyMediaVariants({ variant, className }))}
//       {...props}
//     />
//   );
// }

function UnstableEmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-sm font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function UnstableEmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-xs/relaxed text-muted [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-project",
        className
      )}
      {...props}
    />
  );
}

function UnstableEmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        className
      )}
      {...props}
    />
  );
}

export {
  UnstableEmpty,
  UnstableEmptyContent,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle
};
