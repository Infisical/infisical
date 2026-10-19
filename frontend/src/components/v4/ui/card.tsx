import * as React from "react";

import { cn } from "../lib/utils";

import controlStyles from "./controls.module.css";
import frameStyles from "./frame.module.css";

const FramedContext = React.createContext(false);

const Card = React.forwardRef<
  React.ComponentRef<"div">,
  Omit<React.ComponentPropsWithoutRef<"div">, "title"> & {
    size?: "default" | "sm";
    variant?: "framed" | "plain";
    title?: React.ReactNode;
    description?: string;
    action?: React.ReactNode;
    media?: React.ReactNode;
    footer?: React.ReactNode;
    flush?: boolean;
  }
>(
  (
    {
      className,
      size = "default",
      variant = "framed",
      title,
      description,
      action,
      media,
      footer,
      flush = false,
      children,
      ...props
    },
    ref
  ) => {
    const convenience =
      title !== undefined ||
      description !== undefined ||
      action !== undefined ||
      media !== undefined ||
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
        <FramedContext.Provider value={variant !== "plain"}>
          {convenience ? (
            <>
              {(title !== undefined || description !== undefined || action || media) && (
                <CardHeader>
                  <div className={controlStyles.cardTitleGroup}>
                    {media && <span className={controlStyles.cardMedia}>{media}</span>}
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
              <CardContent>{children}</CardContent>
              {footer !== undefined && <CardFooter>{footer}</CardFooter>}
            </>
          ) : (
            children
          )}
        </FramedContext.Provider>
      </div>
    );
  }
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  const framed = React.useContext(FramedContext);
  return (
    <div
      ref={ref}
      data-slot="card-header"
      className={cn(controlStyles.cardHeader, framed && frameStyles.frameHead, className)}
      {...props}
    />
  );
});
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  const framed = React.useContext(FramedContext);
  return (
    <div
      ref={ref}
      data-slot="card-title"
      className={cn(controlStyles.cardHeading, framed && frameStyles.frameTitle, className)}
      {...props}
    />
  );
});
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="card-description"
      className={cn(controlStyles.cardDescription, className)}
      {...props}
    />
  );
});
CardDescription.displayName = "CardDescription";

const CardAction = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  const framed = React.useContext(FramedContext);
  return (
    <div
      ref={ref}
      data-slot="card-action"
      className={cn(controlStyles.cardAction, framed && frameStyles.frameAction, className)}
      {...props}
    />
  );
});
CardAction.displayName = "CardAction";

const CardContent = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  const framed = React.useContext(FramedContext);
  return (
    <div
      ref={ref}
      data-slot="card-content"
      className={cn(controlStyles.cardBody, framed && frameStyles.frameInset, className)}
      {...props}
    />
  );
});
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  const framed = React.useContext(FramedContext);
  return (
    <div
      ref={ref}
      data-slot="card-footer"
      className={cn(controlStyles.cardFooter, framed && frameStyles.frameInset, className)}
      {...props}
    />
  );
});
CardFooter.displayName = "CardFooter";

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
