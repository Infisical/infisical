import { forwardRef, ReactNode } from "react";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

import { Card, CardBody, CardFooter, CardTitle } from "../Card";
import { IconButton } from "../IconButton";

export type DrawerContentProps = DialogPrimitive.DialogContentProps & {
  title?: ReactNode;
  subTitle?: ReactNode;
  footerContent?: ReactNode;
  onClose?: () => void;
} & VariantProps<typeof drawerContentVariation>;

const drawerContentVariation = cva(
  "fixed ease-in-out duration-300 z-[90] border border-mineshaft-600 drop-shadow-2xl",
  {
    variants: {
      direction: {
        right: [
          "right-0 top-0",
          "h-full w-96",
          "data-[state=open]:animate-drawerRightIn data-[state=closed]:animate-drawerRightOut"
        ]
      }
    }
  }
);

export const DrawerContent = forwardRef<HTMLDivElement, DrawerContentProps>(
  (
    { children, title, subTitle, className, footerContent, direction = "right", onClose, ...props },
    forwardedRef
  ) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-20 h-full w-full"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
      />
      <DialogPrimitive.Content
        {...props}
        ref={forwardedRef}
        className={twMerge(drawerContentVariation({ direction, className }))}
      >
        <Card isRounded={false} className="h-full w-full dark">
          {title && (
            <CardTitle subTitle={subTitle} className="px-4">
              {title}
            </CardTitle>
          )}
          <CardBody className="flex-grow overflow-y-auto overflow-x-hidden px-4 dark:[color-scheme:dark]">
            {children}
          </CardBody>
          {footerContent && <CardFooter>{footerContent}</CardFooter>}{" "}
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

DrawerContent.displayName = "ModalContent";

export type DrawerProps = Omit<DialogPrimitive.DialogProps, "open"> & { isOpen?: boolean };
export const Drawer = ({ isOpen, ...props }: DrawerProps) => (
  <DialogPrimitive.Root open={isOpen} {...props} />
);

export const DrawerTrigger = DialogPrimitive.Trigger;
export type DrawerTriggerProps = DialogPrimitive.DialogTriggerProps;

export const DrawerClose = DialogPrimitive.Close;
export type DrawerCloseProps = DialogPrimitive.DialogCloseProps;
