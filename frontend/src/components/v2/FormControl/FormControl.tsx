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
  <Label.Root className="text-mineshaft-300 text-sm font-medium block mb-1 ml-0.5" htmlFor={id}>
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
      'text-xs font-inter flex items-center opacity-90 text-mineshaft-300 mt-2',
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
};

export const FormControl = ({
  children,
  isRequired,
  label,
  helperText,
  errorText,
  id,
  isError
}: FormControlProps): JSX.Element => {
  return (
    <div>
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
