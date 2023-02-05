import { cloneElement, ReactNode } from 'react';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import * as Label from '@radix-ui/react-label';
import { twMerge } from 'tailwind-merge';

export type FormLabelProps = {
  id?: string;
  isRequired?: boolean;
  label?: ReactNode;
};

export const FormLabel = ({ id, label, isRequired }: FormLabelProps) => (
  <Label.Root className="mb-1 ml-0.5 block text-sm font-medium text-mineshaft-300" htmlFor={id}>
    {label}
    {isRequired && <span className="ml-1 text-red">*</span>}
  </Label.Root>
);

export type FormHelperTextProps = {
  isError?: boolean;
  text?: ReactNode;
};

export const FormHelperText = ({ isError, text }: FormHelperTextProps) => (
  <div
    className={twMerge(
      'mt-2 flex items-center font-inter text-xs text-mineshaft-300 opacity-90',
      isError && 'text-red-600'
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
};

export const FormControl = ({
  children,
  isRequired,
  label,
  helperText,
  errorText,
  id,
  isError,
  className
}: FormControlProps): JSX.Element => {
  return (
    <div className={twMerge('mb-4', className)}>
      {typeof label === 'string' ? (
        <FormLabel label={label} isRequired={isRequired} id={id} />
      ) : (
        label
      )}
      {cloneElement(children, { isRequired, 'data-required': isRequired, isError })}
      {!isError && helperText && <FormHelperText isError={isError} text={helperText} />}
      {isError && errorText && <FormHelperText isError={isError} text={errorText} />}
    </div>
  );
};
