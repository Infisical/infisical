import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  faEllipsisV,
  faGlobe,
  faMagnifyingGlass,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button as DialogButton,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input as DialogInput,
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
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Input
} from "@app/pages/admin/components/AdminV3Adapters";

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
            <DialogInput
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
        <DialogButton variant="ghost" type="button" onClick={onClose}>
          Cancel
        </DialogButton>
        <DialogButton variant="neutral" type="submit" isPending={isSubmitting}>
          Add domain
        </DialogButton>
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
    <div className="mb-6 rounded-lg border border-border bg-card p-5 text-foreground">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xl font-medium text-mineshaft-100">Email Domains</p>
          <p className="text-sm text-bunker-300">
            Manage verified email domains across your instance.
          </p>
        </div>
        <Button
          colorSchema="secondary"
          onClick={() => handlePopUpOpen("addEmailDomain")}
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
        >
          Add Domain
        </Button>
      </div>
      <Input
        aria-label="Search email domains"
        value={searchFilter}
        onChange={(e) => setSearchFilter(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search by domain or organization name..."
        className="flex-1"
      />
      <div className="mt-4">
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
                            <IconButton ariaLabel="Options" size="xs" variant="plain">
                              <FontAwesomeIcon icon={faEllipsisV} />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent sideOffset={2} align="end">
                            <DropdownMenuItem
                              icon={<FontAwesomeIcon icon={faTrash} />}
                              onClick={() =>
                                handlePopUpOpen("deleteEmailDomain", {
                                  emailDomainId: ed.id,
                                  domain: ed.domain
                                })
                              }
                            >
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
          {!isPending && isEmpty && <EmptyState title="No email domains found" icon={faGlobe} />}
        </TableContainer>
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
      <DeleteActionModal
        isOpen={popUp.deleteEmailDomain.isOpen}
        deleteKey="delete"
        title={`Are you sure you want to delete domain ${
          (popUp?.deleteEmailDomain?.data as { domain: string })?.domain || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteEmailDomain", isOpen)}
        onDeleteApproved={handleDelete}
      />
      <AddEmailDomainModal
        isOpen={popUp.addEmailDomain.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addEmailDomain", isOpen)}
      />
    </div>
  );
};
