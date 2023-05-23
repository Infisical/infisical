import { Controller } from 'react-hook-form';
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
    <tr className="absolute flex flex-row sticky top-0">
      <td className="w-10 px-4 flex items-center justify-center">
        <div className='text-center w-10 text-xs text-transparent'>{0}</div>
      </td>
      <Controller
        defaultValue=""
        name="na"
        render={() => (
          <td className='flex items-center'>
            <div className="min-w-[220px] lg:min-w-[240px] xl:min-w-[280px] relative flex items-center justify-start pl-2.5 w-full">
              <div className="inline-flex items-end text-md font-medium">
                Key
                <IconButton variant="plain" className="ml-2" ariaLabel="sort" onClick={onSort}>
                  <FontAwesomeIcon icon={sortDir === 'asc' ? faArrowDown : faArrowUp} />
                </IconButton>
              </div>
              <div className="w-max flex flex-row items-center justify-end">
                <div className="w-5 overflow-hidden group-hover:w-5 mt-1"/>
              </div>
            </div>
          </td>
        )}
      />
      <th className="flex flex-row w-full"><div className="text-sm font-medium">Value</div></th>
    </tr>
    <tr className='h-0 w-full border border-mineshaft-600'/>
  </thead>
);
