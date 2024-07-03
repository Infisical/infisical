import { Controller, useForm } from "react-hook-form";
import { faKey } from "@fortawesome/free-solid-svg-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  EmptyState,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Tab,
  Table,
  TableContainer,
  TabList,
  TabPanel,
  Tabs,
  TBody,
  Td,
  Th,
  THead,
  Tr} from "@app/components/v2";
import { IdentityAuthMethod } from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["identityModalV2", "upgradePlan"]>;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityModalV2", "upgradePlan"]>,
    state?: boolean
  ) => void;
};

enum TabSections {
  AccessTokens = "access-tokens",
  AuthMethod = "auth-method"
}

const schema = z.object({
  name: z.string(),
  role: z.string()
});

type FormData = z.infer<typeof schema>;

export const IdentityModalV2 = ({ popUp, handlePopUpToggle }: Props) => {
  const {
    control,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      role: ""
    }
  });

  const identityData = popUp?.identityModalV2?.data as {
    identityId: string;
    name: string;
    authMethod?: IdentityAuthMethod;
  };

  return (
    <Modal
      isOpen={popUp?.identityModalV2?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("identityModalV2", isOpen);
      }}
    >
      <ModalContent
        className="max-w-screen-lg"
        title={`Manage Service Account: ${identityData?.name ?? ""}`}
      >
        <div className="flex">
          <div className="w-72 border-r-2 border-mineshaft-600 pr-8">
            <div className="flex h-full flex-col justify-between">
              <div>
                <div className="mb-4 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
                  <p className="whitespace-pre-wrap break-all">Some ID</p>
                </div>
                <Controller
                  control={control}
                  defaultValue=""
                  name="name"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
                      <Input {...field} placeholder="Machine 1" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  defaultValue=""
                  name="role"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Organization Role"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input {...field} placeholder="Admin" />
                    </FormControl>
                  )}
                />
              </div>
              <Button size="sm" type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
                Edit
              </Button>
            </div>
          </div>
          <div className="flex-2 pl-8">
            <Tabs defaultValue={TabSections.AccessTokens}>
              <TabList>
                <Tab value={TabSections.AccessTokens}>Access Tokens</Tab>
                <Tab value={TabSections.AuthMethod}>Auth Method</Tab>
              </TabList>
              <TabPanel value={TabSections.AccessTokens}>
                <div className="mb-8">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-md text-mineshaft-100">Access Token</h2>
                    <Button
                      onClick={() => console.log("manage")}
                      colorSchema="secondary"
                      // isDisabled={!isAllowed}
                    >
                      Create Token
                    </Button>
                  </div>
                  <p className="text-sm text-mineshaft-300">
                    Create an access token to authenticate with the API
                  </p>
                </div>
                <TableContainer>
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Token</Th>
                        <Th>Expires</Th>
                        <Th />
                      </Tr>
                    </THead>
                    <TBody>
                      <Tr>
                        <Td colSpan={4}>
                          <EmptyState
                            title="No access tokens have been created for this service account"
                            icon={faKey}
                          />
                        </Td>
                      </Tr>
                    </TBody>
                  </Table>
                </TableContainer>
              </TabPanel>
              <TabPanel value={TabSections.AuthMethod}>Amx</TabPanel>
            </Tabs>
          </div>
        </div>
        {/* <Controller
          control={control}
          name="authMethod"
          defaultValue={IdentityAuthMethod.UNIVERSAL_AUTH}
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl label="Auth Method" errorText={error?.message} isError={Boolean(error)}>
              <Select
                defaultValue={field.value}
                {...field}
                onValueChange={(e) => onChange(e)}
                className="w-full"
                isDisabled={!!identityData?.authMethod}
              >
                {identityAuthMethods.map(({ label, value }) => (
                  <SelectItem value={String(value || "")} key={label}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        /> */}
        {/* {renderIdentityAuthForm()} */}
        {/* <UpgradePlanModal
          isOpen={popUp?.upgradePlan?.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="You can use IP allowlisting if you switch to Infisical's Pro plan."
        /> */}
      </ModalContent>
    </Modal>
  );
};
