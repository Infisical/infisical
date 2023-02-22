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
  <div className={twMerge('flex w-full flex-col items-center p-8 text-mineshaft-50', className)}>
    <div className="mb-4">
      <FontAwesomeIcon icon={icon} size="3x" />
    </div>
    <div className="mb-8 text-gray-300">{title}</div>
    <div>{children}</div>
  </div>
);
