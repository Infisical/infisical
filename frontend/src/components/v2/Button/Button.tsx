import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

type Props = {
  children: ReactNode;
  isDisabled?: boolean;
  // loading state
  isLoading?: boolean;
  // various button sizes
  size: 'sm' | 'md' | 'lg';
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & Props;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, isDisabled = false, className, ...props }, ref): JSX.Element => {
    return (
      <button
        ref={ref}
        aria-disabled={isDisabled}
        type="button"
        className={twMerge(
          'bg-primary hover:opacity-80 transition-all text-sm px-4 py-2 font-bold rounded',
          className
        )}
        disabled={isDisabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
