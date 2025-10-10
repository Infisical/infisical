import { ReactElement } from "react";
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
  startAdornment?: ReactElement;
};

export const Pagination = ({
  count,
  page = 1,
  perPage = 20,
  onChangePage,
  onChangePerPage,
  perPageList = [10, 20, 50, 100],
  className,
  startAdornment
}: PaginationProps) => {
  const prevPageNumber = Math.max(1, page - 1);
  const canGoPrev = page > 1;

  const upperLimit = Math.ceil(count / perPage);
  const nextPageNumber = Math.min(upperLimit, page + 1);
  const canGoNext = page + 1 <= upperLimit;
  const canGoFirst = page > 1;
  const canGoLast = page < upperLimit;

  return (
    <div
      className={twMerge(
        "flex w-full items-center justify-end border-t border-mineshaft-600 bg-mineshaft-800 px-4 py-3 text-white",
        className
      )}
    >
      {startAdornment}
      <div className={twMerge("mr-4 flex items-center space-x-2", startAdornment && "ml-auto")}>
        <div className="text-xs">
          {(page - 1) * perPage + 1} - {Math.min((page - 1) * perPage + perPage, count)} of {count}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton ariaLabel="per-page-list" variant="plain">
              <FontAwesomeIcon className="text-xs" icon={faCaretDown} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent sideOffset={2} className="min-w-fit">
            {perPageList.map((perPageOption) => (
              <DropdownMenuItem
                key={`pagination-per-page-options-${perPageOption}`}
                icon={perPage === perPageOption && <FontAwesomeIcon size="sm" icon={faCheck} />}
                iconPos="right"
                onClick={() => {
                  const totalPages = Math.ceil(count / perPageOption);

                  if (page > totalPages) {
                    onChangePage(totalPages);
                  }

                  onChangePerPage(perPageOption);
                }}
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
          ariaLabel="pagination-first"
          className="relative"
          onClick={() => onChangePage(1)}
          isDisabled={!canGoFirst}
        >
          <FontAwesomeIcon className="absolute top-1 left-2.5 text-xs" icon={faChevronLeft} />
          <FontAwesomeIcon className="text-xs" icon={faChevronLeft} />
        </IconButton>
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
        <IconButton
          variant="plain"
          ariaLabel="pagination-last"
          className="relative"
          onClick={() => onChangePage(upperLimit)}
          isDisabled={!canGoLast}
        >
          <FontAwesomeIcon className="absolute top-1 left-2.5 text-xs" icon={faChevronRight} />
          <FontAwesomeIcon className="text-xs" icon={faChevronRight} />
        </IconButton>
      </div>
    </div>
  );
};
