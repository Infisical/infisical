import { useState } from "react";
import { Controller, FieldPath, FieldValues, useForm } from "react-hook-form";
import { faPlus, faUserSecret } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  EmptyState,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Tab,
  Table,
  TableContainer,
  TabList,
  TabPanel,
  Tabs,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useOrganization, useUser } from "@app/context";
import { useCreateCredential } from "@app/hooks/api/userCredentials/mutation";
import { useGetCredentials } from "@app/hooks/api/userCredentials/queries";
import { CredentialKind, TUserCredential } from "@app/hooks/api/userCredentials/types";
import { usePopUp, UsePopUpReturn, UsePopUpState } from "@app/hooks/usePopUp";

type CreateCredentialModalProps = {
  popUp: UsePopUpState<["credential"]>,
  handlePopUpToggle: UsePopUpReturn<CredentialsPopup>["handlePopUpToggle"];
}

const schema = yup.object({
  kind: yup.mixed().oneOf(Object.values(CredentialKind)).required(),
  name: yup.string().required(),

  // Secure Note
  note: yup.string().when("kind", {
    is: CredentialKind.secureNote,
    then: yup.string().required(),
    otherwise: yup.string().notRequired(),
  }),

  // Login
  url: yup.string().when("kind", {
    is: CredentialKind.creditCard,
    then: yup.string().required(),
    otherwise: yup.string().notRequired(),
  }),

  username: yup.string().when("kind", {
    is: CredentialKind.login,
    then: yup.string().required(),
    otherwise: yup.string().notRequired(),
  }),

  password: yup.string().when("kind", {
    is: CredentialKind.login,
    then: yup.string().required(),
    otherwise: yup.string().notRequired(),
  }),

  // Credit card
  cardNumber: yup.string().when("kind", {
    is: CredentialKind.creditCard,
    then: yup.string().required(),
    otherwise: yup.string().notRequired(),
    // some people might enter spaces in their credit card numbers.
  }).transform(v => v.replaceAll(" ", "d")),

  expiry: yup.date().when("kind", {
    is: CredentialKind.creditCard,
    then: yup.date().default(new Date()).required(),
    otherwise: yup.date().notRequired(),
  }),

  cvv: yup.string().when("kind", {
    is: CredentialKind.creditCard,
    then: yup.string().length(3).matches(/\d{3}/).required(),
    otherwise: yup.string().notRequired(),
  }),
}).required();

export type FormData = yup.InferType<typeof schema>;

type Control<T extends FieldValues> = ReturnType<typeof useForm<T>>["control"]

function FormInputField({ control, name, label, placeholder, type = "text" }: {
  control: Control<FormData>,
  name: FieldPath<FormData>,
  label: string,
  type?: string,
  placeholder?: string
}) {
  return <Controller
    control={control}
    name={name}
    defaultValue=""
    render={({ field, fieldState: { error } }) =>
    (
      <FormControl
        className="mt-4"
        label={label}
        isError={Boolean(error)}
        errorText={error?.message}
      >
        <Input {...field} type={type} placeholder={placeholder} />
      </FormControl>
    )
    } />
}

function CreditCardFields({ control }: { control: Control<FormData> }) {
  return (
    <>
      <FormInputField control={control} name="cardNumber" label="Card Number" placeholder="1234-XXXX-XXXX-XXXX" />
      <FormInputField control={control} name="cvv" label="CVV" placeholder="000" />
      <FormInputField control={control} name="expiry" label="Expiry Date" type="date" />
    </>
  );
}

function LoginFields({ control }: { control: Control<FormData> }) {
  return (
    <>
      <FormInputField control={control} name="url" label="Website" placeholder="example.com" />
      <FormInputField control={control} name="username" label="Username" placeholder="example@email.com" />
      <FormInputField control={control} name="password" label="Password" type="password" />
    </>
  );
}

function CreateCredentialModal({ popUp, handlePopUpToggle }: CreateCredentialModalProps) {
  const [credentialKind, setCredentialKind] = useState(
    CredentialKind.login
  );

  const organization = useOrganization();
  const { user } = useUser();
  const createCredential = useCreateCredential();

  const {
    control,
    handleSubmit,
    reset,
    // formState: { isSubmitting }
    setValue,
  } = useForm<FormData>({
    resolver: yupResolver(schema),
  });

  const onFormSubmit = async (formData: FormData) => {
    let credentials: TUserCredential;
    if (formData.kind === CredentialKind.login) {
      credentials = {
        kind: CredentialKind.login,
        website: formData.url!,
        username: formData.username!,
        password: formData.password!,
        name: formData.name,
      };
    } else if (formData.kind === CredentialKind.creditCard) {
      credentials = {
        kind: CredentialKind.creditCard,
        cardNumber: formData.cardNumber!,
        expiry: (Number(formData.expiry!)).toString(),
        cvv: formData.cvv!,
        name: formData.name!,
      }
    } else {
      credentials = {
        kind: CredentialKind.secureNote,
        note: formData.note!,
        name: formData.name!,
      }
    }


    try {
      const orgId = organization?.currentOrg?.id;
      if (orgId) {
        await createCredential.mutateAsync({
          orgId,
          credential: credentials,
          userId: user.id,
        });
      } else {
        // TODO(@srijan): Queue to request so it fires when the org is loaded 
      }
    } catch (error) {
      createNotification({
        title: "Failed to add credential",
        text: error instanceof Error ? error.message : "Unknown error",
        type: "error"
      });
    }
  }

  return <Modal
    isOpen={popUp.credential.isOpen}
    onOpenChange={(isOpen) => {
      handlePopUpToggle("credential", isOpen);
      reset({ kind: credentialKind });
    }}
  >
    <ModalContent title="Add Credential" >
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <FormInputField
          control={control}
          name="name"
          label="Name"
          placeholder="Example login" />

        <Controller
          control={control}
          name="kind"
          defaultValue={credentialKind}
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl
              label="Credential Kind"
              errorText={error?.message}
              isError={Boolean(error)}
              className="mt-4"
            >
              <Select
                defaultValue={field.value}
                {...field}
                onValueChange={(value) => {
                  onChange(value);
                  setValue("kind", value);
                  setCredentialKind(value as CredentialKind);
                }}
                className="w-full"
              >
                {Object.values(CredentialKind).map((name) => (
                  <SelectItem value={name} key={`st-role-${name}`}>
                    {name}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />

        {
          (() => {
            switch (credentialKind) {
              case CredentialKind.login:
                return <LoginFields control={control} />
              case CredentialKind.creditCard:
                return <CreditCardFields control={control} />
              case CredentialKind.secureNote:
                return <FormInputField control={control} name="note" label="Note" />
              default:
                // We've covered all cases, but for some reason,
                // TypeScript doesn't do an exhaustiveness check for that.
                console.error("impossible switch case arm")
                return null;
            }
          })()
        }


        <div className="flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            isLoading={false}
            isDisabled={false}
          >
            Save
          </Button>

          <Button
            colorSchema="secondary"
            variant="plain"
            onClick={() => handlePopUpToggle("credential", false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </ModalContent>
  </Modal >
}

type LoginTableProps = {
  credentials?: TUserCredential[],
  isLoading: boolean
}

type Login = TUserCredential & { kind: CredentialKind.login }
// type SecureNote = TUserCredential & { kind: CredentialKind.secureNote }

function LoginTable({ credentials, isLoading }: LoginTableProps) {
  const loginCreds: Login[] | undefined =
    credentials?.filter(cred => cred.kind === CredentialKind.login) as Login[];

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Website  </Th>
            <Th>Username </Th>
            <Th>Password </Th>
          </Tr>
        </THead>
        {!isLoading && Array.isArray(loginCreds) && loginCreds.length === 0 ? (
          <Tr>
            <Td colSpan={3}>
              <EmptyState
                title="No credentials have been added so far"
                icon={faUserSecret}
              />
            </Td>
          </Tr>
        ) : null}

        {!isLoading && Array.isArray(loginCreds) && loginCreds.length > 0 &&
          loginCreds?.map((credential) => (
            <Tr key={credential.name}>
              <Td>{credential.website}</Td>
              <Td>{credential.username}</Td>
              <Td>{credential.password}</Td>
            </Tr>
          ))
        }

      </Table>
    </TableContainer>
  );
}

function CreditCardTable() {
  const credentials: Credential[] = [];

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Card Number  </Th>
            <Th>Expiry Date </Th>
            <Th>CVV </Th>
          </Tr>
        </THead>

        {credentials.length === 0 ? (
          <Tr>
            <Td colSpan={3}>
              <EmptyState
                title="No credentials have been added so far"
                icon={faUserSecret}
              />
            </Td>
          </Tr>
        ) : null}
      </Table>
    </TableContainer>
  );
}

function SecureNoteTable() {
  const credentials: Credential[] = [];
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Title </Th>
            <Th>Note     </Th>
          </Tr>
        </THead>

        {credentials.length === 0 ? (
          <Tr>
            <Td colSpan={3}>
              <EmptyState
                title="No credentials have been added so far"
                icon={faUserSecret}
              />
            </Td>
          </Tr>
        ) : null}
      </Table>
    </TableContainer>
  );
}

function CredentialTabs() {
  const [activeTab, setActiveTab] = useState<CredentialKind>(CredentialKind.login);
  const { isLoading, data } = useGetCredentials();

  return <Tabs value={activeTab} onValueChange={v => setActiveTab(v as CredentialKind)}>
    <TabList>
      <Tab value={CredentialKind.login}>
        Log in credentials
      </Tab>

      <Tab value={CredentialKind.creditCard} >
        Credit Cards
      </Tab>

      <Tab value={CredentialKind.secureNote}>
        Secure Notes
      </Tab>
    </TabList>

    <TabPanel value={CredentialKind.login}>
      <LoginTable isLoading={isLoading} credentials={data?.credentials} />
    </TabPanel>

    <TabPanel value={CredentialKind.creditCard}>
      <CreditCardTable />
    </TabPanel>

    <TabPanel value={CredentialKind.secureNote}>
      <SecureNoteTable />
    </TabPanel>
  </Tabs>
}


function CredentialsView({ handlePopUpOpen }: { handlePopUpOpen: UsePopUpReturn<CredentialsPopup>["handlePopUpOpen"] }) {
  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4 w-full">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Credentials</p>
        <div className="flex w-full justify-end pr-4" />
        <Button
          colorSchema="primary"
          type="submit"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => handlePopUpOpen("credential")}
          isDisabled={false}
        >
          Add Credential
        </Button>
      </div>
      <CredentialTabs />
    </div>
  );
}


type CredentialsPopup = ["credential"]

export function UserCredentialsPage() {
  const { popUp,
    handlePopUpOpen,
    // handlePopUpClose, 
    handlePopUpToggle
  } = usePopUp<CredentialsPopup>(["credential"]);

  return (
    <div>
      <div className="full w-full bg-bunker-800 text-white">
        <div className="w-full max-w-7xl">
          <div className="mb-6 text-lg text-mineshaft-300">
            Store and manage credentials like API keys, passwords, and credit card data.
          </div>
        </div>

        <CredentialsView handlePopUpOpen={handlePopUpOpen} />
        <CreateCredentialModal
          popUp={popUp}
          handlePopUpToggle={handlePopUpToggle}
        />
      </div>
    </div>
  );
}
