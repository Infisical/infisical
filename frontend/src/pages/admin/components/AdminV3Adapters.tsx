import {
  ComponentProps,
  ElementType,
  forwardRef,
  ReactElement,
  ReactNode,
  useId,
  useLayoutEffect,
  useState
} from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button as V3Button,
  Checkbox as V3Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem as V3DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton as V3IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Tooltip as V3Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

type LegacyVariant =
  | "danger"
  | "info"
  | "neutral"
  | "outline_bg"
  | "plain"
  | "primary"
  | "secondary";

const mapVariant = (variant?: LegacyVariant, colorSchema?: LegacyVariant) => {
  const value = colorSchema ?? variant;
  if (value === "danger") return "danger";
  if (value === "info") return "info";
  if (value === "plain") return "ghost";
  return "neutral";
};

const mapIconVariant = (variant?: LegacyVariant, colorSchema?: LegacyVariant) => {
  const value = colorSchema ?? variant;
  if (value === "danger") return "danger";
  if (value === "info") return "info";
  if (value === "plain") return "ghost";
  return "outline";
};

type ButtonProps = Omit<ComponentProps<typeof V3Button>, "asChild" | "variant"> & {
  variant?: LegacyVariant;
  colorSchema?: LegacyVariant;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { children, colorSchema, isLoading, leftIcon, rightIcon, variant, isDisabled, ...props },
    ref
  ) => (
    <V3Button
      ref={ref}
      asChild={false}
      variant={mapVariant(variant, colorSchema)}
      isPending={isLoading}
      isDisabled={isDisabled}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </V3Button>
  )
);

Button.displayName = "Button";

type IconButtonProps = Omit<ComponentProps<typeof V3IconButton>, "asChild" | "variant"> & {
  variant?: LegacyVariant;
  colorSchema?: LegacyVariant;
  ariaLabel?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ ariaLabel, colorSchema, variant, ...props }, ref) => (
    <V3IconButton
      ref={ref}
      asChild={false}
      aria-label={ariaLabel}
      variant={mapIconVariant(variant, colorSchema)}
      {...props}
    />
  )
);

IconButton.displayName = "IconButton";

type InputProps = Omit<ComponentProps<typeof InputGroupInput>, "size"> & {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isFullWidth?: boolean;
  containerClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      leftIcon,
      rightIcon,
      isDisabled,
      isReadOnly,
      isRequired,
      isFullWidth = true,
      containerClassName,
      className,
      ...props
    },
    ref
  ) => (
    <InputGroup className={containerClassName} data-full-width={isFullWidth}>
      {leftIcon && <InputGroupAddon>{leftIcon}</InputGroupAddon>}
      <InputGroupInput
        ref={ref}
        disabled={isDisabled}
        readOnly={isReadOnly}
        required={isRequired}
        className={className}
        {...props}
      />
      {rightIcon && <InputGroupAddon align="inline-end">{rightIcon}</InputGroupAddon>}
    </InputGroup>
  )
);

Input.displayName = "Input";

type CheckboxProps = ComponentProps<typeof V3Checkbox> & {
  isChecked?: boolean;
  isDisabled?: boolean;
  isIndeterminate?: boolean;
  children?: ReactNode;
};

export const Checkbox = ({
  children,
  id,
  isChecked,
  isDisabled,
  isIndeterminate,
  ...props
}: CheckboxProps) => (
  <div className="flex items-center gap-2">
    <V3Checkbox
      id={id}
      isChecked={isChecked}
      isIndeterminate={isIndeterminate}
      isDisabled={isDisabled}
      {...props}
    />
    {children && <label htmlFor={id}>{children}</label>}
  </div>
);

type TooltipProps = {
  children: ReactElement;
  content: ReactNode;
  className?: string;
  position?: "top" | "right" | "bottom" | "left";
};

export const Tooltip = ({ children, content, className, position = "top" }: TooltipProps) => (
  <V3Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent className={className} side={position}>
      {content}
    </TooltipContent>
  </V3Tooltip>
);

type DropdownMenuItemProps = ComponentProps<typeof V3DropdownMenuItem> & {
  icon?: ReactNode;
  iconPos?: "left" | "right";
  as?: ElementType;
};

export const DropdownMenuItem = ({
  children,
  icon,
  iconPos = "left",
  as: _as,
  ...props
}: DropdownMenuItemProps) => (
  <V3DropdownMenuItem {...props}>
    {icon && iconPos === "left" && icon}
    {children}
    {icon && iconPos === "right" && icon}
  </V3DropdownMenuItem>
);

type DeleteActionModalProps = {
  isOpen?: boolean;
  onClose?: () => void;
  onChange?: (isOpen: boolean) => void;
  deleteKey: string;
  title: string;
  subTitle?: string;
  onDeleteApproved: () => Promise<void>;
  buttonText?: string;
  formContent?: ReactNode;
  children?: ReactNode;
  deletionMessage?: ReactNode;
  isDisabled?: boolean;
};

export const DeleteActionModal = ({
  isOpen,
  onClose,
  onChange,
  deleteKey,
  onDeleteApproved,
  title,
  subTitle = "This action is irreversible.",
  buttonText = "Delete",
  formContent,
  deletionMessage,
  isDisabled,
  children
}: DeleteActionModalProps) => {
  const [confirmation, setConfirmation] = useState("");
  const [isPending, setIsPending] = useState(false);
  const confirmationInputId = useId();

  useLayoutEffect(() => setConfirmation(""), [isOpen, deleteKey]);

  const handleAction = async () => {
    setIsPending(true);
    try {
      await onDeleteApproved();
      onChange?.(false);
      setConfirmation("");
      onClose?.();
    } catch {
      // MutationCache reports request errors globally; keep the dialog and confirmation available.
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (isPending && !open) return;
        onChange?.(open);
        if (!open) {
          setConfirmation("");
          onClose?.();
        }
      }}
    >
      <AlertDialogContent>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAction();
          }}
        >
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{subTitle}</AlertDialogDescription>
          </AlertDialogHeader>
          {formContent}
          <label className="flex flex-col gap-2 text-sm" htmlFor={confirmationInputId}>
            {deletionMessage || (
              <span>
                Type <strong>{deleteKey}</strong> to perform this action
              </span>
            )}
            <InputGroup>
              <InputGroupInput
                id={confirmationInputId}
                name={confirmationInputId}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={`Type ${deleteKey} here`}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                spellCheck={false}
              />
            </InputGroup>
          </label>
          {children}
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
            <V3Button
              type="submit"
              variant="danger"
              size="sm"
              isPending={isPending}
              isDisabled={confirmation !== deleteKey || isDisabled}
            >
              {buttonText}
            </V3Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const Modal = ({
  isOpen,
  onOpenChange,
  children
}: {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    {children}
  </Dialog>
);

export const ModalContent = ({
  title,
  subTitle,
  footerContent,
  bodyClassName,
  className,
  onClose: _onClose,
  children,
  ...props
}: Omit<ComponentProps<typeof DialogContent>, "title"> & {
  title?: ReactNode;
  subTitle?: ReactNode;
  footerContent?: ReactNode;
  bodyClassName?: string;
  onClose?: () => void;
}) => (
  <DialogContent className={cn("sm:max-w-lg", bodyClassName, className)} {...props}>
    {(title || subTitle) && (
      <DialogHeader className="text-left">
        {title && <DialogTitle>{title}</DialogTitle>}
        {subTitle && <DialogDescription>{subTitle}</DialogDescription>}
      </DialogHeader>
    )}
    {children}
    {footerContent && <DialogFooter>{footerContent}</DialogFooter>}
  </DialogContent>
);

export const FormControl = ({
  label,
  errorText,
  tooltipText,
  className,
  isError,
  children
}: {
  label?: ReactNode;
  errorText?: ReactNode;
  tooltipText?: ReactNode;
  className?: string;
  isError?: boolean;
  children: ReactNode;
}) => (
  <Field className={className} data-invalid={isError}>
    {label && <FieldLabel>{label}</FieldLabel>}
    {children}
    {tooltipText && <FieldDescription>{tooltipText}</FieldDescription>}
    {errorText && <FieldError>{errorText}</FieldError>}
  </Field>
);

export { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger };
