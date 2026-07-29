import { type ReactNode, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, Clock } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Badge,
  Sheet,
  SheetContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { PamAccountType } from "@app/hooks/api/pam";

import { AccountPlatformIcon } from "./AccountPlatformIcon";

type MetadataField = {
  label: string;
  value: ReactNode;
};

export type PamDetailSheetTab = {
  value: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
  indicator?: ReactNode;
};

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading?: boolean;
  icon?: ReactNode;
  accountType?: PamAccountType;
  title?: string;
  subtitle?: ReactNode;
  typeBadge?: string;
  badges?: ReactNode;
  metadata?: MetadataField[];
  actions?: ReactNode;
  footer?: ReactNode;
  tabs?: PamDetailSheetTab[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isDirty?: boolean;
  children?: ReactNode;
};

const TabbedContent = ({
  tabs,
  activeTab,
  onTabChange
}: {
  tabs: PamDetailSheetTab[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}) => {
  const defaultTab = tabs[0]?.value;
  const showTabBar = tabs.length > 1;

  return (
    <Tabs
      {...(onTabChange
        ? { value: activeTab ?? defaultTab, onValueChange: onTabChange }
        : { defaultValue: defaultTab })}
      className={`flex min-h-full flex-col ${showTabBar ? "" : "pt-3"}`}
    >
      {showTabBar && (
        <TabsList variant="pam" className="sticky top-0 z-10 shrink-0 bg-popover">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.icon}
              {tab.label}
              {tab.indicator}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="m-0 flex flex-1 flex-col">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
};

export const PamDetailSheet = ({
  isOpen,
  onOpenChange,
  isLoading,
  icon,
  accountType,
  title,
  subtitle,
  typeBadge,
  badges,
  metadata = [],
  actions,
  footer,
  tabs,
  activeTab,
  onTabChange,
  isDirty,
  children
}: Props) => {
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Warn before closing while a tab form has unsaved changes
  const handleOpenChange = (open: boolean) => {
    if (!open && isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onOpenChange(open);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent className="w-full !max-w-5xl overflow-y-auto">
          {isLoading ? (
            <div className="flex gap-6 p-6">
              <div className="flex w-80 shrink-0 flex-col gap-4">
                <Skeleton className="size-16 rounded-lg" />
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-4 h-4 w-24" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-2 h-4 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
              <div className="flex-1">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="mt-4 h-64 w-full" />
              </div>
            </div>
          ) : (
            <div className="flex h-full">
              <div className="flex w-80 shrink-0 flex-col border-r border-border p-6">
                <div className="flex items-start justify-between">
                  {icon ||
                    (accountType && (
                      <div className="mb-4 flex size-16 items-center justify-center rounded-lg border border-border bg-container">
                        <AccountPlatformIcon accountType={accountType} size={40} />
                      </div>
                    ))}
                  {actions}
                </div>

                {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
                {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
                {(typeBadge || badges) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {typeBadge && <Badge variant="neutral">{typeBadge}</Badge>}
                    {badges}
                  </div>
                )}

                {metadata.length > 0 && (
                  <div className="mt-6 flex flex-col gap-4 border-t border-border pt-4">
                    {metadata.map((field) => (
                      <div key={field.label}>
                        <p className="text-xs font-medium text-muted">{field.label}</p>
                        <div className="mt-1 text-sm break-words whitespace-pre-wrap text-foreground">
                          {field.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {footer && <div className="mt-4">{footer}</div>}
              </div>

              <div className="flex flex-1 flex-col overflow-y-auto">
                {tabs ? (
                  <TabbedContent tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
                ) : (
                  children
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>Your unsaved changes will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={() => {
                setConfirmDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const formatDetailDate = (dateStr: string) => format(new Date(dateStr), "MMMM do, yyyy");

export const formatRelativeExpiry = (dateStr: string) =>
  formatDistanceToNow(new Date(dateStr), { addSuffix: true });

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// A temporary membership whose end time has passed grants no access and can be re-granted
export const isMembershipExpired = (expiresAt?: string | null) =>
  Boolean(expiresAt) && new Date(expiresAt as string).getTime() <= Date.now();

// Expiry cell: danger once elapsed, warning under a day left, dash when permanent
export const MemberExpiry = ({ expiresAt }: { expiresAt?: string | null }) => {
  if (!expiresAt) return <span className="text-sm text-muted">&mdash;</span>;

  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  const isExpired = remainingMs <= 0;
  let variant: "danger" | "warning" | "neutral" = "neutral";
  if (isExpired) variant = "danger";
  else if (remainingMs < ONE_DAY_MS) variant = "warning";

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant={variant}>
          <Clock className="mr-1 size-3" />
          {isExpired ? "Expired" : formatRelativeExpiry(expiresAt)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{format(new Date(expiresAt), "MMMM do, yyyy 'at' h:mm a")}</TooltipContent>
    </Tooltip>
  );
};
