import { cloneElement, ReactNode } from "react";
import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as Label from "@radix-ui/react-label";
import { twMerge } from "tailwind-merge";

export type FormLabelProps = {
  id?: string;
  isRequired?: boolean;
  label?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export const FormLabel = ({ id, label, isRequired, icon, className }: FormLabelProps) => (
  <Label.Root
    className={twMerge(
      "mb-0.5 ml-1 block flex items-center text-sm font-normal text-mineshaft-400",
      className
    )}
    htmlFor={id}
  >
    {label}
    {isRequired && <span className="ml-1 text-red">*</span>}
    {icon && (
      <span className="ml-2 text-mineshaft-300 hover:text-mineshaft-200 cursor-default">
        {icon}
      </span>
    )}
  </Label.Root>
);

export type FormHelperTextProps = {
  isError?: boolean;
  text?: ReactNode;
};

export const FormHelperText = ({ isError, text }: FormHelperTextProps) => (
  <div
    className={twMerge(
      "mt-2 flex items-center font-inter text-xs text-mineshaft-300 opacity-90",
      isError && "text-red-600"
    )}
  >
    {isError && (
      <span>
        <FontAwesomeIcon icon={faExclamationTriangle} size="sm" className="mr-1" />
      </span>
    )}
    <span>{text}</span>
  </div>
);

export type FormControlProps = {
  id?: string;
  isRequired?: boolean;
  isError?: boolean;
  label?: ReactNode;
  helperText?: ReactNode;
  errorText?: ReactNode;
  children: JSX.Element;
  className?: string;
  icon?: ReactNode;
};

export const FormControl = ({
  children,
  isRequired,
  label,
  helperText,
  errorText,
  id,
  isError,
  icon,
  className
}: FormControlProps): JSX.Element => {
  return (
    <div className={twMerge("mb-4", className)}>
      {typeof label === "string" ? (
        <FormLabel label={label} isRequired={isRequired} id={id} icon={icon} />
      ) : (
        label
      )}
      {cloneElement(children, { isRequired, "data-required": isRequired, isError })}
      {!isError && helperText && <FormHelperText isError={isError} text={helperText} />}
      {isError && errorText && <FormHelperText isError={isError} text={errorText} />}
    </div>
  );
};
