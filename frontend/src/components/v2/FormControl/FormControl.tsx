import { cloneElement, ReactElement, ReactNode } from "react";
import { faExclamationTriangle, faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as Label from "@radix-ui/react-label";
import { twMerge } from "tailwind-merge";

import { Tooltip } from "../Tooltip";

export type FormLabelProps = {
  id?: string;
  isRequired?: boolean;
  isOptional?: boolean;
  label?: ReactNode;
  icon?: ReactNode;
  className?: string;
  tooltipClassName?: string;
  tooltipText?: ReactNode;
};

export const FormLabel = ({
  id,
  label,
  isRequired,
  icon,
  className,
  isOptional,
  tooltipClassName,
  tooltipText
}: FormLabelProps) => (
  <Label.Root
    className={twMerge(
      "mb-0.5 flex items-center text-sm font-normal text-mineshaft-400",
      className
    )}
    htmlFor={id}
  >
    {label}
    {isRequired && <span className="ml-1 text-red">*</span>}
    {isOptional && <span className="ml-1 text-xs text-gray-500 italic">- Optional</span>}
    {icon && !tooltipText && (
      <span className="ml-2 cursor-default text-mineshaft-300 hover:text-mineshaft-200">
        {icon}
      </span>
    )}
    {tooltipText && (
      <Tooltip content={tooltipText} className={tooltipClassName}>
        <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
      </Tooltip>
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
      "text-opacity-90 mt-2 flex items-center font-inter text-xs text-mineshaft-300",
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
  isOptional?: boolean;
  isError?: boolean;
  label?: ReactNode;
  helperText?: ReactNode;
  errorText?: ReactNode;
  children: JSX.Element;
  className?: string;
  icon?: ReactNode;
  tooltipText?: ReactElement | string;
  tooltipClassName?: string;
  labelClassName?: string;
};

export const FormControl = ({
  children,
  isRequired,
  isOptional,
  label,
  helperText,
  errorText,
  id,
  isError,
  icon,
  className,
  tooltipText,
  tooltipClassName,
  labelClassName
}: FormControlProps): JSX.Element => {
  return (
    <div className={twMerge("mb-4", className)}>
      {typeof label === "string" ? (
        <FormLabel
          label={label}
          isOptional={isOptional}
          isRequired={isRequired}
          id={id}
          icon={icon}
          tooltipText={tooltipText}
          tooltipClassName={tooltipClassName}
          className={labelClassName}
        />
      ) : (
        label
      )}
      {cloneElement(children, { isRequired, "data-required": isRequired, isError })}
      {!isError && helperText && <FormHelperText isError={isError} text={helperText} />}
      {isError && errorText && <FormHelperText isError={isError} text={errorText} />}
    </div>
  );
};
