import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EllipsisVerticalIcon, Globe2Icon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  IconButton,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination
} from "@app/components/v3";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  useAdminCreateEmailDomain,
  useAdminDeleteEmailDomain,
  useAdminGetEmailDomains,
  useAdminGetOrganizations
} from "@app/hooks/api";
import { OrganizationWithProjects } from "@app/hooks/api/admin/types";
import { AdminDeleteActionDialog } from "@app/pages/admin/components/AdminDeleteActionDialog";
import {
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/pages/admin/components/AdminTable";

const AddEmailDomainSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string() }),
  domain: z.string().trim().toLowerCase().min(1, "Domain is required")
});

type AddEmailDomainFormData = z.infer<typeof AddEmailDomainSchema>;

const AddEmailDomainContent = ({ onClose }: { onClose: () => void }) => {
  const createEmailDomain = useAdminCreateEmailDomain();
  const organizationSelectId = useId();

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, errors }
  } = useForm<AddEmailDomainFormData>({
    resolver: zodResolver(AddEmailDomainSchema),
    defaultValues: {
      domain: ""
    }
  });

  const [searchOrgFilter, setSearchOrgFilter] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useDebounce(searchOrgFilter, 500);

  const { data, isPending } = useAdminGetOrganizations({
    limit: 20,
    searchTerm: debouncedSearchTerm
  });

  const { organizations = [] } = data ?? {};

  const onSubmit = async ({ organization, domain }: AddEmailDomainFormData) => {
    try {
      await createEmailDomain.mutateAsync({ orgId: organization.id, domain });
      createNotification({
        text: "Email domain added successfully",
        type: "success"
      });
      onClose();
    } catch (err: any) {
      createNotification({
        text: err?.response?.data?.message || "Failed to add email domain",
        type: "error"
      });
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <Controller
        control={control}
        name="organization"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor={organizationSelectId}>Organization</FieldLabel>
            <FilterableSelect<OrganizationWithProjects>
              inputId={organizationSelectId}
              isLoading={searchOrgFilter !== debouncedSearchTerm || isPending}
              placeholder="Search organizations..."
              options={organizations}
              getOptionLabel={(org) => org.name}
              getOptionValue={(org) => org.id}
              value={field.value as unknown as OrganizationWithProjects}
              onChange={field.onChange}
              onInputChange={(value) => {
                setSearchOrgFilter(value);
                if (!value) setDebouncedSearchTerm("");
              }}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        control={control}
        name="domain"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor="verified-email-domain">Domain</FieldLabel>
            <Input
              id="verified-email-domain"
              placeholder="company.com"
              isError={Boolean(errors.domain)}
              {...field}
            />
            <FieldError>{errors.domain?.message}</FieldError>
          </Field>
        )}
      />
      <DialogFooter>
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="neutral" type="submit" isPending={isSubmitting}>
          Add domain
        </Button>
      </DialogFooter>
    </form>
  );
};

const AddEmailDomainModal = ({
  isOpen,
  onOpenChange
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle>Add Verified Email Domain</DialogTitle>
        </DialogHeader>
        <AddEmailDomainContent onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
};

export const EmailDomainsTable = () => {
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchFilter, 500);

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "deleteEmailDomain",
    "addEmailDomain"
  ] as const);

  const { offset, limit, setPage, perPage, page, setPerPage } = usePagination("", {
    initPerPage: getUserTablePreference(
      "ResourceOverviewEmailDomainsTable",
      PreferenceKey.PerPage,
      10
    )
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("ResourceOverviewEmailDomainsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isPending } = useAdminGetEmailDomains({
    limit,
    offset,
    searchTerm: debouncedSearchTerm
  });

  const { emailDomains, totalCount = 0 } = data ?? {};
  const isEmpty = !isPending && !totalCount;

  useResetPageHelper({ totalCount, offset, setPage });

  const { mutateAsync: deleteEmailDomain } = useAdminDeleteEmailDomain();

  const handleDelete = async () => {
    const { emailDomainId } = popUp?.deleteEmailDomain?.data as {
      emailDomainId: string;
    };
    await deleteEmailDomain(emailDomainId);
    createNotification({ text: "Email domain deleted", type: "success" });
    handlePopUpClose("deleteEmailDomain");
  };

  return (
    <Card className="mb-6 gap-0 overflow-hidden p-0">
      <CardHeader className="p-6">
        <CardTitle>Email Domains</CardTitle>
        <CardDescription>Manage verified email domains across your instance.</CardDescription>
        <CardAction>
          <Button variant="neutral" onClick={() => handlePopUpOpen("addEmailDomain")}>
            <PlusIcon />
            Add Domain
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search email domains"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search by domain or organization name..."
          />
        </InputGroup>
        <div className="mt-4">
          {isEmpty ? (
            <EmptyState className="border" title="No email domains found" icon={Globe2Icon} />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-1/3">Domain</Th>
                    <Th className="w-1/3">Organization</Th>
                    <Th className="w-1/6">Status</Th>
                    <Th className="w-5" />
                  </Tr>
                </THead>
                <TBody>
                  {isPending && <TableSkeleton columns={4} innerKey="email-domains" />}
                  {!isPending &&
                    emailDomains?.map((ed) => (
                      <Tr key={ed.id} className="w-full">
                        <Td className="max-w-0">
                          <p className="truncate">{ed.domain}</p>
                        </Td>
                        <Td className="max-w-0">
                          <p className="truncate">{ed.orgName ?? ed.orgId}</p>
                        </Td>
                        <Td>
                          <Badge variant={ed.status === "verified" ? "success" : "warning"}>
                            {ed.status}
                          </Badge>
                        </Td>
                        <Td>
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton aria-label="Options" size="xs" variant="ghost">
                                  <EllipsisVerticalIcon />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent sideOffset={2} align="end">
                                <DropdownMenuItem
                                  variant="danger"
                                  onClick={() =>
                                    handlePopUpOpen("deleteEmailDomain", {
                                      emailDomainId: ed.id,
                                      domain: ed.domain
                                    })
                                  }
                                >
                                  <Trash2Icon />
                                  Delete Domain
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
          {!isPending && totalCount > 0 && (
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={handlePerPageChange}
            />
          )}
        </div>
      </CardContent>
      <AdminDeleteActionDialog
        isOpen={popUp.deleteEmailDomain.isOpen}
        confirmationKey="delete"
        title={`Delete "${
          (popUp?.deleteEmailDomain?.data as { domain: string })?.domain || "email domain"
        }"`}
        onChange={(isOpen) => handlePopUpToggle("deleteEmailDomain", isOpen)}
        onConfirm={handleDelete}
      />
      <AddEmailDomainModal
        isOpen={popUp.addEmailDomain.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addEmailDomain", isOpen)}
      />
    </Card>
  );
};
