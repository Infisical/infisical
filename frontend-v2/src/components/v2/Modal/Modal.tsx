import { forwardRef, ReactNode } from "react";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { twMerge } from "tailwind-merge";

import { Card, CardBody, CardFooter, CardTitle } from "../Card";
import { IconButton } from "../IconButton";

export type ModalContentProps = DialogPrimitive.DialogContentProps & {
  title?: ReactNode;
  subTitle?: ReactNode;
  footerContent?: ReactNode;
  bodyClassName?: string;
  onClose?: () => void;
  overlayClassName?: string;
};

export const ModalContent = forwardRef<HTMLDivElement, ModalContentProps>(
  (
    {
      children,
      title,
      subTitle,
      className,
      overlayClassName,
      footerContent,
      bodyClassName,
      onClose,
      ...props
    },
    forwardedRef
  ) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={twMerge("fixed inset-0 z-30 h-full w-full animate-fadeIn", overlayClassName)}
        style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
      />
      <DialogPrimitive.Content {...props} ref={forwardedRef}>
        <Card
          isRounded
          className={twMerge(
            "thin-scrollbar fixed top-1/2 left-1/2 z-30 max-w-xl -translate-y-2/4 -translate-x-2/4 animate-popIn border border-mineshaft-600 drop-shadow-2xl dark:[color-scheme:dark]",
            className
          )}
          style={{ maxHeight: "90%" }}
        >
          {title && <CardTitle subTitle={subTitle}>{title}</CardTitle>}
          <CardBody
            className={twMerge("overflow-y-auto overflow-x-hidden", bodyClassName)}
            style={{ maxHeight: "90%" }}
          >
            {children}
          </CardBody>
          {footerContent && <CardFooter>{footerContent}</CardFooter>}
          <DialogPrimitive.Close aria-label="Close" asChild onClick={onClose}>
            <IconButton
              variant="plain"
              ariaLabel="close"
              className="absolute top-4 right-6 rounded text-bunker-400 hover:text-bunker-50"
            >
              <FontAwesomeIcon icon={faTimes} size="lg" className="cursor-pointer" />
            </IconButton>
          </DialogPrimitive.Close>
        </Card>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
);

ModalContent.displayName = "ModalContent";

export type ModalProps = Omit<DialogPrimitive.DialogProps, "open"> & { isOpen?: boolean };
export const Modal = ({ isOpen, ...props }: ModalProps) => (
  <DialogPrimitive.Root open={isOpen} {...props} />
);

export const ModalTrigger = DialogPrimitive.Trigger;
export type ModalTriggerProps = DialogPrimitive.DialogTriggerProps;

export const ModalClose = DialogPrimitive.Close;
export type ModalCloseProps = DialogPrimitive.DialogCloseProps;
