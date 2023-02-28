import { ReactNode } from 'react';
import { faCubesStacked, IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { twMerge } from 'tailwind-merge';

type Props = {
  title: ReactNode;
  className?: string;
  children?: ReactNode;
  icon?: IconDefinition;
};

export const EmptyState = ({ title, className, children, icon = faCubesStacked }: Props) => (
  <div className={twMerge('flex w-full bg-bunker-700 flex-col items-center px-2 pt-6 text-bunker-300', className)}>
    <FontAwesomeIcon icon={icon} size="2x" className='mr-4' />
    <div className='flex flex-row items-center py-4'>
      <div className="text-bunker-300 text-sm">{title}</div>
      <div>{children}</div>
    </div>
  </div>
);
