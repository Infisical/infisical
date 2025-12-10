import { forwardRef, ReactNode } from "react";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { twMerge } from "tailwind-merge";

import { Card, CardBody, CardFooter, CardTitle } from "../Card";
import { IconButton } from "../IconButton";

export type ModalContentProps = Omit<DialogPrimitive.DialogContentProps, "title"> & {
  title?: ReactNode;
  titleClassName?: string;
  subTitle?: ReactNode;
  footerContent?: ReactNode;
  bodyClassName?: string;
  onClose?: () => void;
  overlayClassName?: string;
  showCloseButton?: boolean;
  closeOnOutsideClick?: boolean;
};

export const ModalContent = forwardRef<HTMLDivElement, ModalContentProps>(
  (
    {
      children,
      title,
      titleClassName,
      subTitle,
      className,
      overlayClassName,
      footerContent,
      bodyClassName,
      onClose,
      showCloseButton = true,
      closeOnOutsideClick = true,
      ...props
    },
    forwardedRef
  ) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={twMerge("animate-fade-in fixed inset-0 z-30 h-full w-full", overlayClassName)}
        style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
      />
      <DialogPrimitive.Content
        {...props}
        ref={forwardedRef}
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          const toastElement = target.closest('[class*="Toastify"]');
          if (toastElement) {
            e.preventDefault();
            return;
          }

          if (closeOnOutsideClick && onClose) {
            onClose();
          }
          props.onPointerDownOutside?.(e);
        }}
      >
        <Card
          isRounded
          className={twMerge(
            "animate-pop-in fixed top-1/2 left-1/2 z-30 thin-scrollbar max-w-xl -translate-x-2/4 -translate-y-2/4 border border-mineshaft-600 drop-shadow-2xl dark:scheme-dark",
            className
          )}
          style={{ maxHeight: "90%" }}
        >
          {title && (
            <DialogPrimitive.Title className={titleClassName}>
              <CardTitle subTitle={subTitle}>{title}</CardTitle>
            </DialogPrimitive.Title>
          )}
          <CardBody
            className={twMerge("overflow-x-hidden overflow-y-auto", bodyClassName)}
            style={{ maxHeight: "90%" }}
          >
            {children}
          </CardBody>
          {footerContent && <CardFooter>{footerContent}</CardFooter>}
          {showCloseButton && (
            <DialogPrimitive.Close aria-label="Close" asChild onClick={onClose}>
              <IconButton
                variant="plain"
                ariaLabel="close"
                className="absolute top-4 right-6 rounded-sm text-bunker-400 hover:text-bunker-50"
              >
                <FontAwesomeIcon icon={faTimes} size="lg" className="cursor-pointer" />
              </IconButton>
            </DialogPrimitive.Close>
          )}
        </Card>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
);

ModalContent.displayName = "ModalContent";

export type ModalProps = Omit<DialogPrimitive.DialogProps, "open"> & {
  isOpen?: boolean;
};
export const Modal = ({ isOpen, ...props }: ModalProps) => (
  <DialogPrimitive.Root open={isOpen} {...props} />
);

export const ModalTrigger = DialogPrimitive.Trigger;
export type ModalTriggerProps = DialogPrimitive.DialogTriggerProps;

export const ModalClose = DialogPrimitive.Close;
export type ModalCloseProps = DialogPrimitive.DialogCloseProps;
