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
    'font-inter font-medium',
    'cursor-pointer',
    'inline-flex items-center justify-center',
    'relative',
    'whitespace-nowrap'
  ],
  {
    variants: {
      colorSchema: {
        primary: ['bg-primary', 'text-black', 'border-primary bg-opacity-80 hover:bg-opacity-100'],
        secondary: ['bg-mineshaft', 'text-gray-300', 'border-mineshaft hover:bg-opacity-80'],
        danger: ['bg-red', 'text-white', 'border-red hover:bg-opacity-90'],
        gray: ['bg-bunker-500', 'text-bunker-200']
      },
      variant: {
        solid: '',
        outline: ['bg-transparent', 'border-2', 'border-solid'],
        plain: '',
        selected: '',
        outline_bg: '',
        // a constant color not in use on hover or click goes colorSchema color
        star: 'text-bunker-200 bg-mineshaft-500'
      },
      isDisabled: {
        true: 'bg-mineshaft text-white opacity-50 cursor-not-allowed',
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
        xs: ['text-xs', 'py-1', 'px-1'],
        sm: ['text-sm', 'py-2', 'px-2'],
        md: ['text-md', 'py-2', 'px-4'],
        lg: ['text-lg', 'py-2', 'px-8']
      }
    },
    compoundVariants: [
      {
        colorSchema: 'primary',
        variant: 'star',
        className: 'hover:bg-primary hover:text-black'
      },
      {
        colorSchema: 'primary',
        variant: 'selected',
        className: 'bg-primary/10 border border-primary/50 text-bunker-200'
      },
      {
        colorSchema: 'primary',
        variant: 'outline_bg',
        className: 'bg-mineshaft-800 border border-mineshaft-600 hover:bg-primary/[0.15] hover:border-primary/60 text-bunker-200'
      },
      {
        colorSchema: 'secondary',
        variant: 'star',
        className: 'bg-mineshaft-700 border border-mineshaft-600 hover:bg-mineshaft hover:text-white'
      },
      {
        colorSchema: 'danger',
        variant: 'star',
        className: 'hover:bg-red hover:text-white'
      },
      {
        colorSchema: 'primary',
        variant: 'outline',
        className: 'text-primary hover:bg-primary hover:text-black'
      },
      {
        colorSchema: 'secondary',
        variant: 'outline',
        className: 'hover:bg-mineshaft'
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
        colorSchema: 'gray',
        variant: 'plain',
        className: 'bg-transparent text-bunker-200'
      },
      {
        colorSchema: 'secondary',
        variant: 'plain',
        className: 'text-mineshaft-300'
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
      size = 'sm',
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
            className="absolute rounded-xl"
          />
        )}
        <div
          className={twMerge(
            'inline-flex shrink-0 cursor-pointer items-center justify-center transition-all',
            loadingToggleClass,
            leftIcon && 'ml-2',
            size === 'xs' ? 'mr-1' : 'mr-2'
          )}
        >
          {leftIcon}
        </div>
        <span className={twMerge('transition-all', isFullWidth ? 'w-full' : 'w-min', loadingToggleClass)}>{children}</span>
        <div
          className={twMerge(
            'inline-flex shrink-0 cursor-pointer items-center justify-center transition-all',
            loadingToggleClass,
            size === 'xs' ? 'ml-1' : 'ml-2'
          )}
        >
          {rightIcon}
        </div>
      </button>
    );
  }
);

Button.displayName = 'Button';
