import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cva, VariantProps } from 'cva';
import { twMerge } from 'tailwind-merge';

type Props = {
  children: ReactNode;
  isDisabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  // loading state
  isLoading?: boolean;
};

const buttonVariants = cva(
  [
    'button',
    'transition-all',
    'font-medium',
    'cursor-pointer',
    'inline-flex items-center justify-center',
    'relative'
  ],
  {
    variants: {
      colorSchema: {
        primary: ['bg-primary', 'text-black', 'border-primary hover:bg-opacity-80'],
        secondary: ['bg-mineshaft-200', 'text-white', 'border-mineshaft-200'],
        danger: ['bg-red', 'text-white', 'border-red']
      },
      variant: {
        solid: '',
        outline: ['bg-transparent', 'border', 'border-solid'],
        plain: ''
      },
      isDisabled: {
        true: 'bg-opacity-70',
        false: ''
      },
      isFullWidth: {
        true: 'w-full',
        false: ''
      },
      isRounded: {
        true: 'rounded-md',
        false: ''
      },
      size: {
        xs: ['text-xs', 'py-1', 'px-2'],
        sm: ['text-sm', 'py-2', 'px-4'],
        md: ['text-md', 'py-2', 'px-6'],
        lg: ['text-lg', 'py-2', 'px-8']
      }
    },
    compoundVariants: [
      {
        colorSchema: 'primary',
        variant: 'outline',
        className: 'text-primary hover:bg-primary hover:text-black'
      },
      {
        colorSchema: 'secondary',
        variant: 'outline',
        className: 'text-mineshaft-200 hover:bg-mineshaft-400 hover:text-white'
      },
      {
        colorSchema: 'danger',
        variant: 'outline',
        className: 'text-red hover:bg-red hover:text-black'
      },
      {
        colorSchema: 'primary',
        variant: 'plain',
        className: 'text-primary'
      },
      {
        colorSchema: 'secondary',
        variant: 'plain',
        className: 'text-mineshaft-400'
      },
      {
        colorSchema: 'danger',
        variant: 'plain',
        className: 'text-red'
      },
      {
        colorSchema: ['danger', 'primary', 'secondary'],
        variant: ['plain'],
        className: 'bg-transparent py-1 px-1'
      }
    ]
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> &
  Props;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      isDisabled = false,
      className = '',
      size = 'md',
      variant = 'solid',
      isFullWidth,
      isRounded = true,
      leftIcon,
      rightIcon,
      isLoading,
      colorSchema = 'primary',
      ...props
    },
    ref
  ): JSX.Element => {
    const loadingToggleClass = isLoading ? 'opacity-0' : 'opacity-100';

    return (
      <button
        ref={ref}
        aria-disabled={isDisabled}
        type="button"
        className={twMerge(
          buttonVariants({
            className,
            colorSchema,
            size,
            variant,
            isRounded,
            isDisabled,
            isFullWidth
          })
        )}
        disabled={isDisabled}
        {...props}
      >
        {isLoading && (
          <img
            src="/images/loading/loadingblack.gif"
            width={36}
            alt="loading animation"
            className="rounded-xl absolute"
          />
        )}
        <span
          className={twMerge(
            'transition-all shrink-0 cursor-pointer',
            loadingToggleClass,
            size === 'xs' ? 'mr-1' : 'mr-2'
          )}
        >
          {leftIcon}
        </span>
        <span className={twMerge('transition-all', loadingToggleClass)}>{children}</span>
        <span
          className={twMerge(
            'transition-all shrink-0 cursor-pointer',
            loadingToggleClass,
            size === 'xs' ? 'ml-1' : 'ml-2'
          )}
        >
          {rightIcon}
        </span>
      </button>
    );
  }
);

Button.displayName = 'Button';
