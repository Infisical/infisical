import { forwardRef } from "react";
import {
  faExclamationCircle,
  faExclamationTriangle,
  faInfoCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type VariantProps, cva } from "cva";
import { twMerge } from "tailwind-merge";

const alertVariants = cva(
  "w-full bg-mineshaft-800 rounded-lg border px-4 py-3 text-sm flex items-center gap-x-4",
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
>(({ className, variant, title, icon, hideTitle = false, children, ...props }, ref) => {
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
          <FontAwesomeIcon className="text-lg" icon={variantIconMap[variant ?? "default"]} />
        )}
      </div>
      <div className="flex flex-col gap-y-1">
        {hideTitle ? null : (
          <h5 className="font-medium leading-none tracking-tight" {...props}>
            {defaultTitle}
          </h5>
        )}
        {children}
      </div>
    </div>
  );
});
Alert.displayName = "Alert";

const AlertDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={twMerge("text-sm [&_p]:leading-relaxed", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertDescription };
