import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { cn } from "../../utils";
import { Button } from "../Button";
import { DIALOG_CONTENT_WIDTH_CLASSNAME } from "../Dialog";
import { Field, FieldLabel } from "../Field";
import { Input } from "../Input";

type AlertDialogConfirmationContextValue = {
  actionRef: React.MutableRefObject<HTMLButtonElement | null>;
  confirmationValue?: string;
  inputValue: string;
  isConfirmed: boolean;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
};

const AlertDialogConfirmationContext = React.createContext<AlertDialogConfirmationContextValue>({
  actionRef: { current: null },
  inputValue: "",
  isConfirmed: true,
  setInputValue: () => undefined
});

type AlertDialogProps = React.ComponentProps<typeof AlertDialogPrimitive.Root> & {
  confirmationValue?: string;
};

function AlertDialog(alertDialogProps: AlertDialogProps) {
  const hasConfirmation = Object.prototype.hasOwnProperty.call(
    alertDialogProps,
    "confirmationValue"
  );
  const { confirmationValue, onOpenChange, ...props } = alertDialogProps;
  const [inputValue, setInputValue] = React.useState("");
  const actionRef = React.useRef<HTMLButtonElement>(null);
  const isConfirmed =
    !hasConfirmation || (confirmationValue !== undefined && inputValue === confirmationValue);
  const confirmationContextValue = React.useMemo(
    () => ({ actionRef, confirmationValue, inputValue, isConfirmed, setInputValue }),
    [confirmationValue, inputValue, isConfirmed]
  );

  React.useEffect(() => {
    if (props.open === false) setInputValue("");
  }, [props.open]);

  const handleOpenChange = (open: boolean) => {
    if (!open) setInputValue("");
    onOpenChange?.(open);
  };

  return (
    <AlertDialogConfirmationContext.Provider value={confirmationContextValue}>
      <AlertDialogPrimitive.Root
        data-slot="alert-dialog"
        onOpenChange={handleOpenChange}
        {...props}
      />
    </AlertDialogConfirmationContext.Provider>
  );
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm";
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] thin-scrollbar -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto overscroll-none rounded-lg border border-border bg-popover p-6 text-foreground shadow-lg duration-200 outline-none has-data-[slot=alert-dialog-footer]:pb-0 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[size=sm]:max-w-sm",
          DIALOG_CONTENT_WIDTH_CLASSNAME,
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "flex shrink-0 flex-col gap-2 text-left text-balance group-data-[size=sm]/alert-dialog-content:place-items-center group-data-[size=sm]/alert-dialog-content:text-center has-data-[slot=alert-dialog-media]:grid has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:place-items-start has-data-[slot=alert-dialog-media]:gap-3 has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-cols-[auto_1fr] sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "sticky bottom-0 z-10 -mx-6 flex shrink-0 flex-row flex-wrap justify-end gap-2 rounded-b-lg border-t border-border bg-container p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-container group-data-[size=sm]/alert-dialog-content:mb-0 sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "text-lg font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "text-sm text-label md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogConfirmationLabel({
  className,
  confirmationValue,
  ...props
}: Omit<React.ComponentProps<typeof FieldLabel>, "children"> & {
  confirmationValue: React.ReactNode;
}) {
  return (
    <FieldLabel
      data-slot="alert-dialog-confirmation-label"
      size="sm"
      className={cn("gap-0", className)}
      {...props}
    >
      <span>
        Type &quot;<span className="font-medium text-foreground">{confirmationValue}</span>&quot; to
        confirm.
      </span>
    </FieldLabel>
  );
}

function AlertDialogConfirmationField({
  className,
  children,
  inputProps,
  onConfirm,
  ...props
}: React.ComponentProps<"div"> & {
  inputProps?: Omit<React.ComponentProps<typeof Input>, "value" | "onChange">;
  onConfirm?: () => void;
}) {
  const inputId = React.useId();
  const { actionRef, confirmationValue, inputValue, isConfirmed, setInputValue } = React.useContext(
    AlertDialogConfirmationContext
  );

  return (
    <div data-slot="alert-dialog-confirmation-field" className={cn("mt-4", className)} {...props}>
      {children !== undefined ? (
        children
      ) : (
        <Field>
          <AlertDialogConfirmationLabel
            htmlFor={inputProps?.id ?? inputId}
            confirmationValue={confirmationValue}
          />
          <Input
            autoComplete="off"
            autoFocus
            placeholder={confirmationValue}
            {...inputProps}
            id={inputProps?.id ?? inputId}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              inputProps?.onKeyDown?.(event);
              if (!event.defaultPrevented && event.key === "Enter" && isConfirmed) {
                event.preventDefault();
                if (onConfirm) {
                  onConfirm();
                } else {
                  actionRef.current?.click();
                }
              }
            }}
          />
        </Field>
      )}
    </div>
  );
}

function AlertDialogAction({
  className,
  variant = "outline",
  size = "sm",
  isFullWidth = false,
  isDisabled = false,
  isPending = false,
  ref,
  ...props
}: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Action>, "asChild"> &
  Pick<
    React.ComponentProps<typeof Button>,
    "variant" | "size" | "isFullWidth" | "isDisabled" | "isPending"
  >) {
  const { actionRef, isConfirmed } = React.useContext(AlertDialogConfirmationContext);

  const setActionRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      actionRef.current = node;

      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        const mutableRef = ref as React.MutableRefObject<HTMLButtonElement | null>;
        mutableRef.current = node;
      }
    },
    [actionRef, ref]
  );

  // Invert the asChild composition: Radix's Action lends its close-on-click behaviour to the real
  // Button, so Button renders a native <button> and its isPending spinner works (a Slot child would
  // strip it). Button forbids isPending together with asChild for exactly that reason.
  return (
    <AlertDialogPrimitive.Action asChild>
      <Button
        ref={setActionRef}
        data-slot="alert-dialog-action"
        variant={variant}
        size={size}
        isPending={isPending}
        isFullWidth={isFullWidth}
        isDisabled={isDisabled || !isConfirmed}
        className={cn(className)}
        {...props}
      />
    </AlertDialogPrimitive.Action>
  );
}

function AlertDialogCancel({
  className,
  variant = "ghost",
  size = "sm",
  isFullWidth = false,
  isDisabled = false,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size" | "isFullWidth" | "isDisabled">) {
  return (
    <Button variant={variant} size={size} isFullWidth={isFullWidth} isDisabled={isDisabled} asChild>
      <AlertDialogPrimitive.Cancel
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogConfirmationLabel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger
};
