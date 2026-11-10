import { type ReactNode, useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Meta } from "@app/components/v4/ui/text";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";

export const PAGE_SIZES = [10, 20, 50, 100];

export const Muted = ({ children }: { children: ReactNode }) => (
  <Meta mono={false}>{children}</Meta>
);

export const fullName = (user: { firstName?: string | null; lastName?: string | null }) =>
  `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null;

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export const usePaging = (table: string, initialPerPage: number) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(table, PreferenceKey.PerPage, initialPerPage)
  );
  return {
    page,
    setPage,
    perPage,
    offset: (page - 1) * perPage,
    setPerPage: (next: number) => {
      setPerPage(next);
      setPage(1);
      setUserTablePreference(table, PreferenceKey.PerPage, next);
    }
  };
};

export type Paging = ReturnType<typeof usePaging>;

export const usePageReset = ({ offset, setPage }: Paging, totalCount: number) => {
  useEffect(() => {
    if (totalCount <= offset) setPage(1);
  }, [totalCount, offset, setPage]);
};

export const pagination = (paging: Paging, totalCount: number, label: string) =>
  totalCount > 0 ? (
    <Pagination
      label={label}
      variant="compact"
      page={paging.page}
      onPageChange={paging.setPage}
      total={totalCount}
      pageSize={paging.perPage}
      pageSizeOptions={PAGE_SIZES}
      onPageSizeChange={paging.setPerPage}
    />
  ) : undefined;

export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description = "This action is irreversible.",
  confirmText,
  actionLabel = "Delete",
  tone = "danger",
  onConfirm,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText: string;
  actionLabel?: string;
  tone?: "danger" | "neutral";
  onConfirm: () => Promise<void>;
  children?: ReactNode;
}) => {
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The mutation cache already toasts request errors; staying open lets the admin retry.
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent tone={tone} confirmText={confirmText} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            asChild
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            <Button variant={tone === "danger" ? "destructive" : "primary"} loading={pending}>
              {actionLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
