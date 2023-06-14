import { ReactNode } from 'react';
import { faClose } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { cva, VariantProps } from 'cva';
import { twMerge } from 'tailwind-merge';

type Props = {
  children: ReactNode;
  className?: string;
  onClose?: () => void;
  color?: string;
  isDisabled?: boolean;
} & VariantProps<typeof tagVariants>;

const tagVariants = cva(
  'inline-flex items-center whitespace-nowrap text-sm rounded-sm mr-1.5 text-bunker-200',
  {
    variants: {
      colorSchema: {
        gray: 'bg-mineshaft-500',
        red: 'bg-red/80 text-bunker-100',
        green: 'bg-primary-800 text-white'
      },
      size: {
        sm: 'px-2 py-0.5'
      }
    }
  }
);

export const Tag = ({
  children,
  className,
  colorSchema = 'gray',
  color,
  isDisabled,
  size = 'sm',
  onClose
}: Props) => (
  <div
    className={twMerge(tagVariants({ colorSchema, className, size }))}
    style={{ backgroundColor: color }}
  >
    {children}
    {onClose && (
      <button
        type="button"
        onClick={onClose}
        disabled={isDisabled}
        className="ml-2 flex items-center justify-center"
      >
        <FontAwesomeIcon icon={faClose} />
      </button>
    )}
  </div>
);
