import { ReactNode } from 'react';
import { cva, VariantProps } from 'cva';
import { twMerge } from 'tailwind-merge';

type Props = {
  children: ReactNode;
  className?: string;
} & VariantProps<typeof tagVariants>;

const tagVariants = cva('inline-flex whitespace-nowrap text-sm rounded-sm mr-1.5 text-bunker-200 ', {
  variants: {
    colorSchema: {
      gray: 'bg-mineshaft-500',
      red: 'bg-red/80 text-bunker-100'
    },
    size: {
      sm: 'px-1.5 py-0.5'
    }
  }
});

export const Tag = ({ children, className, colorSchema = 'gray', size = 'sm' }: Props) => (
  <div className={twMerge(tagVariants({ colorSchema, className, size }))}>{children}</div>
);
