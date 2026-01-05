import { ReactElement } from "react";
import {
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuTrigger
} from "../Dropdown";
import { UnstableIconButton } from "../IconButton";

type UnstablePaginationProps = {
  count: number;
  page: number;
  perPage?: number;
  onChangePage: (pageNumber: number) => void;
  onChangePerPage: (newRows: number) => void;
  className?: string;
  perPageList?: number[];
  startAdornment?: ReactElement;
};

const UnstablePagination = ({
  count,
  page = 1,
  perPage = 20,
  onChangePage,
  onChangePerPage,
  perPageList = [10, 20, 50, 100],
  className,
  startAdornment
}: UnstablePaginationProps) => {
  const prevPageNumber = Math.max(1, page - 1);
  const canGoPrev = page > 1;

  const upperLimit = Math.ceil(count / perPage);
  const nextPageNumber = Math.min(upperLimit, page + 1);
  const canGoNext = page + 1 <= upperLimit;
  const canGoFirst = page > 1;
  const canGoLast = page < upperLimit;

  return (
    <div className={twMerge("flex w-full items-center justify-end px-2 pt-2", className)}>
      {startAdornment}
      <div className={twMerge("mr-4 flex items-center space-x-2", startAdornment && "ml-auto")}>
        <div className="text-xs">
          {(page - 1) * perPage + 1} - {Math.min((page - 1) * perPage + perPage, count)} of {count}
        </div>
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton variant="ghost" size="xs">
              <ChevronDownIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end">
            {perPageList.map((perPageOption) => (
              <UnstableDropdownMenuCheckboxItem
                checked={perPageOption === perPage}
                key={`pagination-per-page-options-${perPageOption}`}
                onClick={() => {
                  const totalPages = Math.ceil(count / perPageOption);

                  if (page > totalPages) {
                    onChangePage(totalPages);
                  }

                  onChangePerPage(perPageOption);
                }}
              >
                {perPageOption} rows per page
              </UnstableDropdownMenuCheckboxItem>
            ))}
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
      </div>
      <div className="flex items-center space-x-2">
        <UnstableIconButton
          variant="ghost"
          size="xs"
          onClick={() => onChangePage(1)}
          isDisabled={!canGoFirst}
        >
          <ChevronFirstIcon />
        </UnstableIconButton>
        <UnstableIconButton
          variant="ghost"
          size="xs"
          onClick={() => onChangePage(prevPageNumber)}
          isDisabled={!canGoPrev}
        >
          <ChevronLeftIcon />
        </UnstableIconButton>
        <UnstableIconButton
          variant="ghost"
          size="xs"
          onClick={() => onChangePage(nextPageNumber)}
          isDisabled={!canGoNext}
        >
          <ChevronRightIcon />
        </UnstableIconButton>
        <UnstableIconButton
          variant="ghost"
          size="xs"
          onClick={() => onChangePage(upperLimit)}
          isDisabled={!canGoLast}
        >
          <ChevronLastIcon />
        </UnstableIconButton>
      </div>
    </div>
  );
};

export { UnstablePagination, type UnstablePaginationProps };
