import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  faCheck,
  faCopy,
  faMagnifyingGlass,
  faPencil,
  faPlus,
  faServer,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import { yupResolver } from "@hookform/resolvers/yup";
// import * as yup from "yup";
// import { generateKeyPair } from "@app/components/utilities/cryptography/crypto";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  //   FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  //   Select,
  //   SelectItem,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useOrganization, useWorkspace } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import {
  // useCreateServiceAccount,
  useDeleteServiceAccount,
  useGetServiceAccounts
} from "@app/hooks/api";

import // Controller,
// useForm
"react-hook-form";

// const serviceAccountExpiration = [
//   { label: "1 Day", value: 86400 },
//   { label: "7 Days", value: 604800 },
//   { label: "1 Month", value: 2592000 },
//   { label: "6 months", value: 15552000 },
//   { label: "12 months", value: 31104000 },
//   { label: "Never", value: -1 }
// ];

// const addServiceAccountFormSchema = yup.object({
//     name: yup.string().required().label("Name").trim(),
//     expiresIn: yup.string().required().label("Service Account Expiration")
// });

// type TAddServiceAccountForm = yup.InferType<typeof addServiceAccountFormSchema>;

export const OrgServiceAccountsTable = () => {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();

  const orgId = currentOrg?._id || "";
  const [step, setStep] = useState(0);
  const [isAccessKeyCopied, setIsAccessKeyCopied] = useToggle(false);
  const [isPublicKeyCopied, setIsPublicKeyCopied] = useToggle(false);
  const [isPrivateKeyCopied, setIsPrivateKeyCopied] = useToggle(false);
  const [accessKey] = useState("");
  const [publicKey] = useState("");
  const [privateKey] = useState("");
  const [searchServiceAccountFilter, setSearchServiceAccountFilter] = useState("");
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addServiceAccount",
    "removeServiceAccount"
  ] as const);

  const { data: serviceAccounts = [], isLoading: isServiceAccountsLoading } =
    useGetServiceAccounts(orgId);

  // const createServiceAccount = useCreateServiceAccount();
  const removeServiceAccount = useDeleteServiceAccount();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAccessKeyCopied) {
      timer = setTimeout(() => setIsAccessKeyCopied.off(), 2000);
    }

    if (isPublicKeyCopied) {
      timer = setTimeout(() => setIsPublicKeyCopied.off(), 2000);
    }

    if (isPrivateKeyCopied) {
      timer = setTimeout(() => setIsPrivateKeyCopied.off(), 2000);
    }

    return () => clearTimeout(timer);
  }, [isAccessKeyCopied, isPublicKeyCopied, isPrivateKeyCopied]);

  // const {
  //     control,
  //     handleSubmit,
  //     reset,
  //     formState: { isSubmitting }
  // } = useForm<TAddServiceAccountForm>({ resolver: yupResolver(addServiceAccountFormSchema) });

  // const onAddServiceAccount = async ({ name, expiresIn }: TAddServiceAccountForm) => {
  //     if (!currentOrg?._id) return;

  //     const keyPair = generateKeyPair();
  //     setPublicKey(keyPair.publicKey);
  //     setPrivateKey(keyPair.privateKey);

  //     const serviceAccountDetails = await createServiceAccount.mutateAsync({
  //         name,
  //         organizationId: currentOrg?._id,
  //         publicKey: keyPair.publicKey,
  //         expiresIn: Number(expiresIn)
  //     });

  //     setAccessKey(serviceAccountDetails.serviceAccountAccessKey);

  //     setStep(1);
  //     reset();
  // }

  const onRemoveServiceAccount = async () => {
    const serviceAccountId = (popUp?.removeServiceAccount?.data as { _id: string })?._id;
    await removeServiceAccount.mutateAsync(serviceAccountId);
    handlePopUpClose("removeServiceAccount");
  };

  const filteredServiceAccounts = useMemo(
    () =>
      serviceAccounts.filter(({ name }) => name.toLowerCase().includes(searchServiceAccountFilter)),
    [serviceAccounts, searchServiceAccountFilter]
  );

  const renderStep = (stepToRender: number) => {
    switch (stepToRender) {
      case 0:
        return (
          <div>
            We are currently revising the service account mechanism. In the meantime, please use
            service tokens or API key to fetch secrets via API request.
          </div>
          //    <form onSubmit={handleSubmit(onAddServiceAccount)}>
          //         <Controller
          //             control={control}
          //             defaultValue=""
          //             name="name"
          //             render={({ field, fieldState: { error } }) => (
          //                 <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
          //                 <Input {...field} />
          //                 </FormControl>
          //             )}
          //         />
          //         <Controller
          //             control={control}
          //             name="expiresIn"
          //             defaultValue={String(serviceAccountExpiration?.[0]?.value)}
          //             render={({ field: { onChange, ...field }, fieldState: { error } }) => {
          //                 return (
          //                     <FormControl
          //                         label="Expiration"
          //                         errorText={error?.message}
          //                         isError={Boolean(error)}
          //                     >
          //                         <Select
          //                             defaultValue={field.value}
          //                             {...field}
          //                             onValueChange={(e) => onChange(e)}
          //                             className="w-full"
          //                         >
          //                         {serviceAccountExpiration.map(({ label, value }) => (
          //                             <SelectItem value={String(value)} key={label}>
          //                                 {label}
          //                             </SelectItem>
          //                         ))}
          //                         </Select>
          //                     </FormControl>
          //                 );
          //             }}
          //         />
          //         <div className="mt-8 flex items-center">
          //             <Button
          //                 className="mr-4"
          //                 size="sm"
          //                 type="submit"
          //                 isLoading={isSubmitting}
          //                 isDisabled={isSubmitting}
          //             >
          //                 Create Service Account
          //             </Button>
          //             <Button
          //                 colorSchema="secondary"
          //                 variant="plain"
          //                 onClick={() => handlePopUpClose("addServiceAccount")}
          //             >
          //                 Cancel
          //             </Button>
          //         </div>
          //     </form>
        );
      case 1:
        return (
          <>
            <p>Access Key</p>
            <div className="flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
              <p className="mr-4 break-all">{accessKey}</p>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(accessKey);
                  setIsAccessKeyCopied.on();
                }}
              >
                <FontAwesomeIcon icon={isAccessKeyCopied ? faCheck : faCopy} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  Copy
                </span>
              </IconButton>
            </div>
            <p className="mt-4">Public Key</p>
            <div className="flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
              <p className="mr-4 break-all">{publicKey}</p>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(publicKey);
                  setIsPublicKeyCopied.on();
                }}
              >
                <FontAwesomeIcon icon={isPublicKeyCopied ? faCheck : faCopy} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  Copy
                </span>
              </IconButton>
            </div>
            <p className="mt-4">Private Key</p>
            <div className="flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
              <p className="mr-4 break-all">{privateKey}</p>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(privateKey);
                  setIsPrivateKeyCopied.on();
                }}
              >
                <FontAwesomeIcon icon={isPrivateKeyCopied ? faCheck : faCopy} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  Copy
                </span>
              </IconButton>
            </div>
          </>
        );
      default:
        return <div />;
    }
  };

  return (
    <div className="w-full">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Service Accounts</p>
        <Button
          colorSchema="secondary"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => {
            setStep(0);
            // reset();
            handlePopUpOpen("addServiceAccount");
          }}
        >
          Add Service Account
        </Button>
      </div>
      <Input
        value={searchServiceAccountFilter}
        onChange={(e) => setSearchServiceAccountFilter(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search service accounts..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Th>Name</Th>
            <Th className="w-full">Valid Until</Th>
            <Th aria-label="actions" />
          </THead>
          <TBody>
            {isServiceAccountsLoading && (
              <TableSkeleton columns={5} innerKey="org-service-accounts" />
            )}
            {!isServiceAccountsLoading &&
              filteredServiceAccounts.map(({ name, expiresAt, _id: serviceAccountId }) => {
                return (
                  <Tr key={`org-service-account-${serviceAccountId}`}>
                    <Td>{name}</Td>
                    <Td>{new Date(expiresAt).toUTCString()}</Td>
                    <Td>
                      <div className="flex">
                        <IconButton
                          ariaLabel="edit"
                          colorSchema="secondary"
                          onClick={() => {
                            if (currentWorkspace?._id) {
                              router.push(
                                `/settings/org/${currentWorkspace._id}/service-accounts/${serviceAccountId}`
                              );
                            }
                          }}
                          className="mr-2"
                        >
                          <FontAwesomeIcon icon={faPencil} />
                        </IconButton>
                        <IconButton
                          ariaLabel="delete"
                          colorSchema="danger"
                          onClick={() =>
                            handlePopUpOpen("removeServiceAccount", { _id: serviceAccountId })
                          }
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </IconButton>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isServiceAccountsLoading && filteredServiceAccounts?.length === 0 && (
          <EmptyState title="No service accounts found" icon={faServer} />
        )}
      </TableContainer>
      <Modal
        isOpen={popUp?.addServiceAccount?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addServiceAccount", isOpen);
          // reset();
        }}
      >
        <ModalContent
          title="Add Service Account"
          subTitle="A service account represents a machine identity such as a VM or application client."
        >
          {renderStep(step)}
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.removeServiceAccount.isOpen}
        deleteKey="remove"
        title="Do you want to remove this service account from the org?"
        onChange={(isOpen) => handlePopUpToggle("removeServiceAccount", isOpen)}
        onDeleteApproved={onRemoveServiceAccount}
      />
    </div>
  );
};
