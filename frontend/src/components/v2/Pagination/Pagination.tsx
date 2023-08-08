import {
  faCaretDown,
  faCheck,
  faChevronLeft,
  faChevronRight
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../Dropdown";
import { IconButton } from "../IconButton";

export type PaginationProps = {
  count: number;
  page: number;
  perPage?: number;
  onChangePage: (pageNumber: number) => void;
  onChangePerPage: (newRows: number) => void;
  className?: string;
  perPageList?: number[];
};

export const Pagination = ({
  count,
  page = 1,
  perPage = 20,
  onChangePage,
  onChangePerPage,
  perPageList = [10, 20, 50, 100],
  className
}: PaginationProps) => {
  const prevPageNumber = Math.max(1, page - 1);
  const canGoPrev = page > 1;

  const upperLimit = Math.ceil(count / perPage);
  const nextPageNumber = Math.min(upperLimit, page + 1);
  const canGoNext = page + 1 <= upperLimit;

  return (
    <div
      className={twMerge(
        "flex items-center justify-end text-white w-full py-3 px-4 bg-mineshaft-800",
        className
      )}
    >
      <div className="mr-6 flex items-center space-x-2">
        <div className="text-xs">
          {(page - 1) * perPage} - {(page - 1) * perPage + perPage} of {count}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton ariaLabel="per-page-list" variant="plain">
              <FontAwesomeIcon className="text-xs" icon={faCaretDown} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-fit">
            {perPageList.map((perPageOption) => (
              <DropdownMenuItem
                key={`pagination-per-page-options-${perPageOption}`}
                icon={perPage === perPageOption && <FontAwesomeIcon size="sm" icon={faCheck} />}
                iconPos="right"
                onClick={() => onChangePerPage(perPageOption)}
              >
                {perPageOption} rows per page
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center space-x-4">
        <IconButton
          variant="plain"
          ariaLabel="pagination-prev"
          onClick={() => onChangePage(prevPageNumber)}
          isDisabled={!canGoPrev}
        >
          <FontAwesomeIcon className="text-xs" icon={faChevronLeft} />
        </IconButton>
        <IconButton
          variant="plain"
          ariaLabel="pagination-next"
          onClick={() => onChangePage(nextPageNumber)}
          isDisabled={!canGoNext}
        >
          <FontAwesomeIcon className="text-xs" icon={faChevronRight} />
        </IconButton>
      </div>
    </div>
  );
};
