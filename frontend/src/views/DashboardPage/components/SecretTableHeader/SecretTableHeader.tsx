import { faArrowDown, faArrowUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { IconButton } from '@app/components/v2';

type Props = {
  sortDir: 'asc' | 'desc';
  onSort: () => void;
};

export const SecretTableHeader = ({
  sortDir,
  onSort
}: Props): JSX.Element => (
  <thead>
    <tr className="flex flex-row">
      {/* <th className="w-10 text-center"/> */}
      <th className='w-1/5 min-w-[220px]'>
        <div className="inline-flex items-end">
          Key
          <IconButton variant="plain" className="ml-2" ariaLabel="sort" onClick={onSort}>
            <FontAwesomeIcon icon={sortDir === 'asc' ? faArrowDown : faArrowUp} />
          </IconButton>
        </div>
      </th>
      <th className='w-full'>Value</th>
    </tr>
  </thead>
);
