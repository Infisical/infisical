import { faArrowDown, faArrowUp, faComments } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { twMerge } from 'tailwind-merge';

import { IconButton, Tooltip } from '@app/components/v2';

type Props = {
  isCommentColumnCollapsed?: boolean;
  sortDir: 'asc' | 'desc';
  onSort: () => void;
  onCommentColToggle: () => void;
};

export const SecretTableHeader = ({
  sortDir,
  isCommentColumnCollapsed,
  onSort,
  onCommentColToggle
}: Props): JSX.Element => (
  <thead>
    <tr className="">
      <th className="w-16 text-center">#</th>
      <th className={twMerge('w-1/5 min-w-[220px]', isCommentColumnCollapsed && 'w-1/4')}>
        <div className="inline-flex items-end">
          Key
          <IconButton variant="plain" className="ml-2" ariaLabel="sort" onClick={onSort}>
            <FontAwesomeIcon icon={sortDir === 'asc' ? faArrowDown : faArrowUp} />
          </IconButton>
        </div>
      </th>
      <th
        className={twMerge(
          'w-1/5 cursor-pointer py-2 px-4 font-medium hover:outline hover:outline-mineshaft-400',
          isCommentColumnCollapsed && 'w-12'
        )}
        onClick={onCommentColToggle}
      >
        <Tooltip content={isCommentColumnCollapsed ? 'Expand' : 'Minimise'}>
          <div
            className={twMerge('flex items-center', isCommentColumnCollapsed && 'justify-center')}
          >
            {isCommentColumnCollapsed ? <FontAwesomeIcon icon={faComments} /> : 'Comment'}
          </div>
        </Tooltip>
      </th>
      <th className={isCommentColumnCollapsed ? 'w-3/4' : '3/5'}>Value</th>
    </tr>
  </thead>
);
