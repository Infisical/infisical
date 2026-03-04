import { ReactNode } from "react";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { twMerge } from "tailwind-merge";

import { IconButton } from "../IconButton";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  imageAlt?: string;
  title?: ReactNode;
  description?: ReactNode;
  /** Optional CTA button or other footer content */
  footerContent?: ReactNode;
  /** Max width of the modal content. Default: max-w-2xl */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
};

const MAX_WIDTH_CLASS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl"
} as const;

export const FeatureShowcaseModal = ({
  isOpen,
  onClose,
  imageSrc,
  imageAlt = "Feature preview",
  title,
  description,
  footerContent,
  maxWidth = "2xl"
}: Props): JSX.Element => (
  <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={twMerge(
          "animate-fade-in fixed inset-0 z-[9999] h-full w-full",
          "bg-black/20 backdrop-blur-sm"
        )}
      />
      <DialogPrimitive.Content
        onPointerDownOutside={onClose}
        onEscapeKeyDown={onClose}
        className="fixed top-1/2 left-1/2 z-[9999] flex w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center"
      >
        <div
          className={twMerge(
            "animate-pop-in mx-auto overflow-hidden rounded-lg border border-mineshaft-500/60 bg-mineshaft-700/75 shadow-2xl backdrop-blur-md",
            MAX_WIDTH_CLASS[maxWidth]
          )}
        >
          {/* Image */}
          <div className="relative aspect-video w-full overflow-hidden bg-mineshaft-900">
            <img
              src={imageSrc}
              alt={imageAlt}
              className="h-full w-full object-contain object-center"
            />
            <DialogPrimitive.Close
              aria-label="Close"
              asChild
              onClick={onClose}
              className="absolute top-3 right-3"
            >
              <IconButton
                variant="plain"
                ariaLabel="close"
                className="rounded-full bg-black/50 text-bunker-300 hover:bg-black/70 hover:text-bunker-50"
              >
                <FontAwesomeIcon icon={faTimes} size="sm" />
              </IconButton>
            </DialogPrimitive.Close>
          </div>

          {/* Text content */}
          {(title || description || footerContent) && (
            <div className="space-y-4 p-6">
              {title && (
                <h3 className="text-xl font-semibold text-white">{title}</h3>
              )}
              {description && (
                <p className="text-sm text-bunker-300">{description}</p>
              )}
              {footerContent && (
                <div className="flex justify-start pt-2">{footerContent}</div>
              )}
            </div>
          )}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
);
