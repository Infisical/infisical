import { forwardRef, ReactNode } from 'react';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { twMerge } from 'tailwind-merge';

import { Card, CardBody, CardFooter, CardTitle } from '../Card';
import { IconButton } from '../IconButton';

export type ModalContentProps = DialogPrimitive.DialogContentProps & {
  title?: ReactNode;
  subTitle?: string;
  footerContent?: ReactNode;
};

export const ModalContent = forwardRef<HTMLDivElement, ModalContentProps>(
  ({ children, title, subTitle, className, footerContent, ...props }, forwardedRef) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 w-full h-full animate-fadeIn"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      />
      <DialogPrimitive.Content {...props} ref={forwardedRef}>
        <Card
          isRounded
          className={twMerge(
            'fixed max-w-md animate-popIn top-1/2 left-1/2 -translate-y-2/4 -translate-x-2/4',
            className
          )}
        >
          {title && <CardTitle subTitle={subTitle}>{title}</CardTitle>}
          <CardBody>{children}</CardBody>
          {footerContent && <CardFooter>{footerContent}</CardFooter>}
          <DialogPrimitive.Close aria-label="Close" asChild>
            <IconButton
              variant="plain"
              ariaLabel="close"
              className="absolute top-2.5 right-2.5 text-white hover:bg-gray-600 rounded"
            >
              <FontAwesomeIcon icon={faTimes} size="sm" className="cursor-pointer" />
            </IconButton>
          </DialogPrimitive.Close>
        </Card>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
);

ModalContent.displayName = 'ModalContent';

export type ModalProps = Omit<DialogPrimitive.DialogProps, 'open'> & { isOpen?: boolean };
export const Modal = ({ isOpen, ...props }: ModalProps) => (
  <DialogPrimitive.Root open={isOpen} {...props} />
);

export const ModalTrigger = DialogPrimitive.Trigger;
export type ModalTriggerProps = DialogPrimitive.DialogTriggerProps;
