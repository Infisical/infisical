import { forwardRef } from "react";
import {
  faExclamationCircle,
  faExclamationTriangle,
  faInfoCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { cva, type VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

const alertVariants = cva(
  "w-full bg-mineshaft-800 rounded-lg border border-bunker-400 px-4 py-3 text-sm flex items-center gap-x-3",
  {
    variants: {
      variant: {
        default: "",
        danger: "text-red border-red",
        warning: "text-yellow border-yellow"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

type AlertProps = {
  title?: string;
  hideTitle?: boolean;
  icon?: React.ReactNode;
  iconClassName?: string;
};

const variantTitleMap = {
  default: "Info",
  danger: "Danger",
  warning: "Warning"
};

const variantIconMap = {
  default: faInfoCircle,
  danger: faExclamationCircle,
  warning: faExclamationTriangle
};

const Alert = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants> & AlertProps
>(
  (
    { className, variant, title, icon, hideTitle = false, children, iconClassName, ...props },
    ref
  ) => {
    const defaultTitle = title ?? variantTitleMap[variant ?? "default"];
    return (
      <div
        ref={ref}
        role="alert"
        className={twMerge(alertVariants({ variant }), className)}
        {...props}
      >
        <div>
          {typeof icon !== "undefined" ? (
            <>{icon} </>
          ) : (
            <FontAwesomeIcon
              className={twMerge("text-lg text-primary", iconClassName)}
              icon={variantIconMap[variant ?? "default"]}
            />
          )}
        </div>
        <div className="flex flex-col gap-y-1">
          {hideTitle ? null : (
            <h5 className="leading-6 font-medium tracking-tight" {...props}>
              {defaultTitle}
            </h5>
          )}
          {children}
        </div>
      </div>
    );
  }
);
Alert.displayName = "Alert";

const AlertDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={twMerge("text-sm", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertDescription };
