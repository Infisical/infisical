import * as React from "react";

import { cn } from "../lib/utils";

import controlStyles from "./controls.module.css";
import frameStyles from "./frame.module.css";

const FramedContext = React.createContext(false);

function Card({
  className,
  size = "default",
  variant = "framed",
  title,
  description,
  action,
  footer,
  footerPlacement = "inset",
  flush = false,
  children,
  ref,
  ...props
}: Omit<React.ComponentPropsWithoutRef<"div">, "title"> & {
  size?: "default" | "sm";
  variant?: "framed" | "plain";
  title?: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  footerPlacement?: "inset" | "frame";
  flush?: boolean;
} & { ref?: React.Ref<React.ComponentRef<"div">> }) {
  const convenience =
    title !== undefined ||
    description !== undefined ||
    action !== undefined ||
    footer !== undefined;
  return (
    <div
      ref={ref}
      data-slot="card"
      data-size={size}
      data-variant={variant}
      data-flush={flush || undefined}
      className={cn(
        "group/card",
        controlStyles.card,
        variant === "plain" ? controlStyles.cardPlain : frameStyles.frame,
        className
      )}
      {...props}
    >
      <FramedContext value={variant !== "plain"}>
        {convenience &&
        variant !== "plain" &&
        footer !== undefined &&
        footerPlacement === "frame" ? (
          <>
            <div
              data-slot="card-inset"
              className={cn(frameStyles.frameInset, controlStyles.cardInset)}
            >
              <FramedContext value={false}>
                {(title !== undefined || description !== undefined || action) && (
                  <CardHeader>
                    <div className={controlStyles.cardTitleGroup}>
                      <div className={controlStyles.cardCopy}>
                        {title !== undefined && <CardTitle>{title}</CardTitle>}
                        {description !== undefined && (
                          <CardDescription>{description}</CardDescription>
                        )}
                      </div>
                    </div>
                    {action && <CardAction>{action}</CardAction>}
                  </CardHeader>
                )}
                {children !== undefined && children !== null && (
                  <CardContent>{children}</CardContent>
                )}
              </FramedContext>
            </div>
            <CardFooter placement="frame">{footer}</CardFooter>
          </>
        ) : convenience ? (
          <>
            {(title !== undefined || description !== undefined || action) && (
              <CardHeader>
                <div className={controlStyles.cardTitleGroup}>
                  <div className={controlStyles.cardCopy}>
                    {title !== undefined && <CardTitle>{title}</CardTitle>}
                    {description !== undefined && <CardDescription>{description}</CardDescription>}
                  </div>
                </div>
                {action && <CardAction>{action}</CardAction>}
              </CardHeader>
            )}
            <CardContent>{children}</CardContent>
            {footer !== undefined && <CardFooter placement={footerPlacement}>{footer}</CardFooter>}
          </>
        ) : (
          children
        )}
      </FramedContext>
    </div>
  );
}
Card.displayName = "Card";

function CardHeader({ className, ref, ...props }: React.ComponentProps<"div">) {
  const framed = React.useContext(FramedContext);
  return (
    <div
      ref={ref}
      data-slot="card-header"
      data-framed={framed || undefined}
      className={cn(controlStyles.cardHeader, framed && frameStyles.frameHead, className)}
      {...props}
    />
  );
}
CardHeader.displayName = "CardHeader";

function CardTitle({ className, ref, ...props }: React.ComponentProps<"div">) {
  const framed = React.useContext(FramedContext);
  return (
    <div
      ref={ref}
      data-slot="card-title"
      className={cn(controlStyles.cardHeading, framed && frameStyles.frameTitle, className)}
      {...props}
    />
  );
}
CardTitle.displayName = "CardTitle";

function CardDescription({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="card-description"
      className={cn(controlStyles.cardDescription, className)}
      {...props}
    />
  );
}
CardDescription.displayName = "CardDescription";

function CardAction({ className, ref, ...props }: React.ComponentProps<"div">) {
  const framed = React.useContext(FramedContext);
  return (
    <div
      ref={ref}
      data-slot="card-action"
      className={cn(controlStyles.cardAction, framed && frameStyles.frameAction, className)}
      {...props}
    />
  );
}
CardAction.displayName = "CardAction";

function CardContent({ className, ref, ...props }: React.ComponentProps<"div">) {
  const framed = React.useContext(FramedContext);
  return (
    <div
      ref={ref}
      data-slot="card-content"
      className={cn(controlStyles.cardBody, framed && frameStyles.frameInset, className)}
      {...props}
    />
  );
}
CardContent.displayName = "CardContent";

function CardFooter({
  className,
  placement = "inset",
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { placement?: "inset" | "frame" } & {
  ref?: React.Ref<React.ComponentRef<"div">>;
}) {
  const framed = React.useContext(FramedContext);
  const band = framed && placement === "frame";
  return (
    <div
      ref={ref}
      data-slot="card-footer"
      data-placement={band ? "frame" : undefined}
      className={cn(
        controlStyles.cardFooter,
        framed && (band ? frameStyles.frameFoot : frameStyles.frameInset),
        className
      )}
      {...props}
    />
  );
}
CardFooter.displayName = "CardFooter";

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
