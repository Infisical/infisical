import { useState } from "react";
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
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterableSelect,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
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

const AddEmailDomainSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string() }),
  domain: z.string().trim().toLowerCase().min(1, "Domain is required")
});

type AddEmailDomainFormData = z.infer<typeof AddEmailDomainSchema>;

const AddEmailDomainContent = ({ onClose }: { onClose: () => void }) => {
  const createEmailDomain = useAdminCreateEmailDomain();

  const {
    handleSubmit,
    control,
    register,
    formState: { isSubmitting, errors }
  } = useForm<AddEmailDomainFormData>({
    resolver: zodResolver(AddEmailDomainSchema)
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
      createNotification({ text: "Email domain added successfully", type: "success" });
      onClose();
    } catch (err: any) {
      createNotification({
        text: err?.response?.data?.message || "Failed to add email domain",
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        control={control}
        name="organization"
        render={({ field, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Organization">
            <FilterableSelect<OrganizationWithProjects>
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
          </FormControl>
        )}
      />
      <FormControl
        isError={Boolean(errors.domain)}
        errorText={errors.domain?.message}
        label="Domain"
      >
        <Input {...register("domain")} placeholder="company.com" />
      </FormControl>
      <div className="flex w-full gap-4 pt-4">
        <Button
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
          colorSchema="secondary"
        >
          Add Domain
        </Button>
        <Button onClick={onClose} variant="plain" colorSchema="secondary">
          Cancel
        </Button>
      </div>
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
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent bodyClassName="overflow-visible" title="Add Verified Email Domain">
        <AddEmailDomainContent onClose={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
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
    const { emailDomainId } = popUp?.deleteEmailDomain?.data as { emailDomainId: string };
    await deleteEmailDomain(emailDomainId);
    createNotification({ text: "Email domain deleted", type: "success" });
    handlePopUpClose("deleteEmailDomain");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
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
                            <IconButton
                              ariaLabel="Options"
                              colorSchema="secondary"
                              className="w-6"
                              variant="plain"
                            >
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
