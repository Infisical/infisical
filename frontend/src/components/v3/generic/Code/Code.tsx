import { cva, type VariantProps } from "cva";

import { cn } from "@app/components/v3/utils";

const codeVariants = cva("box-decoration-clone font-mono", {
  variants: {
    variant: {
      default: "rounded-sm bg-foreground/10 px-1",
      plain: ""
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

type CodeProps = React.ComponentProps<"code"> & VariantProps<typeof codeVariants>;

const Code = ({ className, variant = "default", ...props }: CodeProps) => (
  <code
    data-slot="code"
    data-variant={variant}
    className={cn(codeVariants({ variant }), className)}
    {...props}
  />
);

export { Code, type CodeProps, codeVariants };
