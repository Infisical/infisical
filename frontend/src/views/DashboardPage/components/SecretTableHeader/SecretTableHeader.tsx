import { faArrowDown, faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton } from "@app/components/v2";

type Props = {
  sortDir: "asc" | "desc";
  onSort: () => void;
};

export const SecretTableHeader = ({ sortDir, onSort }: Props): JSX.Element => (
  <thead className="sticky top-0 z-50 bg-mineshaft-800">
    <tr className="top-0 flex flex-row">
      <td className="flex w-10 items-center justify-center border-none px-4">
        <div className="w-10 text-center text-xs text-transparent">{0}</div>
      </td>
      <td className="flex items-center">
        <div className="relative flex w-full min-w-[220px] items-center justify-start pl-2.5 lg:min-w-[240px] xl:min-w-[280px]">
          <div className="text-md inline-flex items-end font-medium">
            Key
            <IconButton variant="plain" className="ml-2" ariaLabel="sort" onClick={onSort}>
              <FontAwesomeIcon icon={sortDir === "asc" ? faArrowDown : faArrowUp} />
            </IconButton>
          </div>
          <div className="flex w-max flex-row items-center justify-end">
            <div className="mt-1 w-5 overflow-hidden group-hover:w-5" />
          </div>
        </div>
      </td>
      <th className="flex w-full flex-row">
        <div className="text-sm font-medium">Value</div>
      </th>
    </tr>
    <tr className="h-0 w-full border border-mineshaft-600" />
  </thead>
);
