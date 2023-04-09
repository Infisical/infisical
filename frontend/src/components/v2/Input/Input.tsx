import { forwardRef, InputHTMLAttributes, ReactNode } from 'react';
import { cva, VariantProps } from 'cva';
import { twMerge } from 'tailwind-merge';

type Props = {
  placeholder?: string;
  isFullWidth?: boolean;
  isRequired?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  isDisabled?: boolean;
  isReadOnly?: boolean;
};

const inputVariants = cva(
  'input w-full py-[0.375rem] text-gray-400 placeholder:text-sm placeholder-gray-500 placeholder-opacity-50 outline-none focus:ring-2',
  {
    variants: {
      size: {
        xs: ['text-xs'],
        sm: ['text-sm'],
        md: ['text-md'],
        lg: ['text-lg']
      },
      isRounded: {
        true: ['rounded-md'],
        false: ''
      },
      variant: {
        filled: ['bg-bunker-800', 'text-gray-400'],
        outline: ['bg-transparent'],
        plain: 'bg-transparent outline-none'
      },
      isError: {
        true: 'focus:ring-red/50 placeholder-red-300',
        false: 'focus:ring-primary/50'
      }
    },
    compoundVariants: []
  }
);

const inputParentContainerVariants = cva('inline-flex font-inter items-center border relative', {
  variants: {
    isRounded: {
      true: ['rounded-md'],
      false: ''
    },
    isError: {
      true: 'border-red',
      false: 'border-mineshaft-500'
    },
    isFullWidth: {
      true: 'w-full',
      false: ''
    },
    variant: {
      filled: ['bg-bunker-800', 'text-gray-400'],
      outline: ['bg-transparent'],
      plain: 'border-none'
    }
  }
});

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
  VariantProps<typeof inputVariants> &
  Props;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      isRounded = true,
      isFullWidth = true,
      isDisabled,
      isError = false,
      isRequired,
      leftIcon,
      rightIcon,
      variant = 'filled',
      size = 'md',
      isReadOnly,
      ...props
    },
    ref
  ): JSX.Element => {
    return (
      <div className={inputParentContainerVariants({ isRounded, isError, isFullWidth, variant })}>
        {leftIcon && <span className="absolute left-0 ml-3 text-sm">{leftIcon}</span>}
        <input
          {...props}
          required={isRequired}
          ref={ref}
          readOnly={isReadOnly}
          disabled={isDisabled}
          className={twMerge(
            leftIcon ? 'pl-10' : 'pl-2.5',
            rightIcon ? 'pr-10' : 'pr-2.5',
            inputVariants({ className, isError, size, isRounded, variant })
          )}
        />
        {rightIcon && <span className="absolute right-0 mr-3">{rightIcon}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
