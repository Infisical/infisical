import { useState } from "react";
import { format } from "date-fns";
import {
  CircleCheck,
  CircleX,
  Clock,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trash2
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  OrgPermissionEmailDomainActions,
  OrgPermissionSubjects,
  useOrganization
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { TEmailDomain, useDeleteEmailDomain, useGetEmailDomains } from "@app/hooks/api";

const STATUS_BADGE = {
  pending: { label: "Pending", icon: Clock, variant: "info" as const },
  verified: { label: "Verified", icon: CircleCheck, variant: "success" as const },
  expired: { label: "Expired", icon: CircleX, variant: "danger" as const }
};

type Props = {
  onVerifyDomain: (emailDomain: TEmailDomain) => void;
};

export const OrgEmailDomainsTable = ({ onVerifyDomain }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: emailDomains, isPending } = useGetEmailDomains(currentOrg?.id ?? "");
  const [searchDomain, setSearchDomain] = useState("");
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeDomain"
  ] as const);
  const { mutateAsync: deleteEmailDomain } = useDeleteEmailDomain();

  const onRemoveDomain = async () => {
    const emailDomainId = (popUp?.removeDomain?.data as { id: string })?.id;
    if (!emailDomainId) return;

    try {
      await deleteEmailDomain({ emailDomainId });
      createNotification({
        text: "Successfully removed email domain",
        type: "success"
      });
      handlePopUpClose("removeDomain");
    } catch (error) {
      createNotification({
        text: (error as Error)?.message || "Failed to remove email domain",
        type: "error"
      });
    }
  };

  const filteredDomains = emailDomains
    ? emailDomains.filter(({ domain }) => domain.toLowerCase().includes(searchDomain.toLowerCase()))
    : [];

  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search domains"
          value={searchDomain}
          onChange={(e) => setSearchDomain(e.target.value)}
        />
      </InputGroup>
      {!isPending && filteredDomains.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No email domains found</EmptyTitle>
            <EmptyDescription>Add an email domain to setup your IDP.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Verified at</TableHead>
              <TableHead>Expires at</TableHead>
              <TableHead className="w-px text-right" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, idx) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`email-domain-skeleton-${idx}`}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {filteredDomains.map((emailDomain) => {
              const badge = STATUS_BADGE[emailDomain.status] ?? STATUS_BADGE.pending;
              const StatusIcon = badge.icon;
              return (
                <TableRow key={emailDomain.id}>
                  <TableCell className="font-medium text-foreground">
                    {emailDomain.domain}
                  </TableCell>
                  <TableCell>
                    <Badge variant={badge.variant}>
                      <StatusIcon />
                      {badge.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {emailDomain.verifiedAt ? (
                      format(new Date(emailDomain.verifiedAt), "MMM d, yyyy")
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {emailDomain.status === "pending" ? (
                      format(new Date(emailDomain.codeExpiresAt), "MMM d, yyyy")
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {emailDomain.status === "pending" && (
                        <OrgPermissionCan
                          I={OrgPermissionEmailDomainActions.VerifyDomain}
                          a={OrgPermissionSubjects.EmailDomains}
                        >
                          {(isAllowed) =>
                            isAllowed && (
                              <Badge asChild variant="warning">
                                <button type="button" onClick={() => onVerifyDomain(emailDomain)}>
                                  <ShieldCheck />
                                  Verify Domain
                                </button>
                              </Badge>
                            )
                          }
                        </OrgPermissionCan>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label={`Actions for ${emailDomain.domain}`}
                          >
                            <MoreHorizontal />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {emailDomain.status === "pending" && (
                            <OrgPermissionCan
                              I={OrgPermissionEmailDomainActions.VerifyDomain}
                              a={OrgPermissionSubjects.EmailDomains}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  isDisabled={!isAllowed}
                                  onClick={() => onVerifyDomain(emailDomain)}
                                >
                                  <ShieldCheck />
                                  Verify
                                </DropdownMenuItem>
                              )}
                            </OrgPermissionCan>
                          )}
                          <OrgPermissionCan
                            I={OrgPermissionEmailDomainActions.Delete}
                            an={OrgPermissionSubjects.EmailDomains}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                variant="danger"
                                isDisabled={!isAllowed}
                                onClick={() =>
                                  handlePopUpOpen("removeDomain", {
                                    id: emailDomain.id,
                                    domain: emailDomain.domain
                                  })
                                }
                              >
                                <Trash2 />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <AlertDialog
        open={popUp.removeDomain.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("removeDomain", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Remove domain &quot;
              {(popUp?.removeDomain?.data as { domain?: string })?.domain}
              &quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the domain from your organization. Any SSO login associated with this
              domain will no longer work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={onRemoveDomain}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
