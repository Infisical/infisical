import { useState } from "react";
import { MutationCache, QueryClient } from "@tanstack/react-query";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
// akhilmhdh: doing individual imports to avoid cyclic import error
import { Button } from "@app/components/v2/Button";
import { Modal, ModalContent, ModalTrigger } from "@app/components/v2/Modal";
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from "@app/components/v2/Table";
import {
  formatedConditionsOperatorNames,
  PermissionConditionOperators
} from "@app/context/ProjectPermissionContext/types";
import { formatValidationErrorPath } from "@app/lib/fn/permission";
import { camelCaseToSpaces } from "@app/lib/fn/string";

import { ApiErrorTypes, TApiErrors } from "./types";
// this is saved in react-query cache
export const SIGNUP_TEMP_TOKEN_CACHE_KEY = ["infisical__signup-temp-token"];
export const MFA_TEMP_TOKEN_CACHE_KEY = ["infisical__mfa-temp-token"];
export const AUTH_TOKEN_CACHE_KEY = ["infisical__auth-token"];

function ValidationErrorModal({
  serverResponse,
  requestBody
}: {
  serverResponse: TApiErrors;
  requestBody?: Record<string, unknown> | null;
}) {
  const [open, setOpen] = useState(true);

  if (serverResponse.error !== ApiErrorTypes.ValidationError) {
    return null;
  }

  return (
    <Modal isOpen={open} onOpenChange={setOpen}>
      <ModalContent title="Validation Error Details">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Field</Th>
                <Th>Issue</Th>
              </Tr>
            </THead>
            <TBody>
              {serverResponse.message?.map(({ message, path }) => (
                <Tr key={path.join(".")}>
                  <Td>{formatValidationErrorPath(path, requestBody)}</Td>
                  <Td>{message.toLowerCase()}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      </ModalContent>
    </Modal>
  );
}

export const onRequestError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const serverResponse = error.response?.data as TApiErrors;
    if (serverResponse?.error === ApiErrorTypes.ValidationError) {
      let requestBody: Record<string, unknown> | undefined;
      try {
        const configData = error.config?.data;
        requestBody =
          typeof configData === "string"
            ? JSON.parse(configData)
            : (configData as Record<string, unknown>);
      } catch {
        requestBody = undefined;
      }

      createNotification(
        {
          title: "Validation Error",
          type: "error",
          text: "Please check the input and try again.",
          callToAction: (
            <ValidationErrorModal serverResponse={serverResponse} requestBody={requestBody} />
          ),
          copyActions: [
            {
              value: serverResponse.reqId,
              name: "Request ID",
              label: `Request ID: ${serverResponse.reqId}`
            }
          ]
        },
        { closeOnClick: false }
      );
      return;
    }
    if (serverResponse?.error === ApiErrorTypes.ForbiddenError) {
      createNotification(
        {
          title: "Forbidden Access",
          type: "error",
          text: `${serverResponse.message}.`,
          callToAction: serverResponse?.details?.length ? (
            <Modal>
              <ModalTrigger asChild>
                <Button variant="outline_bg" size="xs">
                  Show more
                </Button>
              </ModalTrigger>
              <ModalContent
                title="Validation Rules"
                subTitle="Please review the allowed rules below."
              >
                <div className="flex flex-col gap-2">
                  {serverResponse.details?.map((el, index) => {
                    const hasConditions = Boolean(Object.keys(el.conditions || {}).length);
                    return (
                      <div
                        key={`Forbidden-error-details-${index + 1}`}
                        className="rounded-md border border-gray-600 p-4"
                      >
                        <div>
                          {el.inverted ? "Cannot" : "Can"}{" "}
                          <span className="text-yellow-600">
                            {el.action.toString().replaceAll(",", ", ")}
                          </span>{" "}
                          {el.subject.toString()} {hasConditions && "with conditions:"}
                        </div>
                        {hasConditions && (
                          <ul className="flex list-disc flex-col gap-1 pt-2 pl-5 text-sm">
                            {Object.keys(el.conditions || {}).flatMap((field, fieldIndex) => {
                              const operators = (
                                el.conditions as Record<
                                  string,
                                  | string
                                  | { [K in PermissionConditionOperators]: string | string[] }
                                >
                              )[field];

                              const formattedFieldName = camelCaseToSpaces(field).toLowerCase();
                              if (typeof operators === "string") {
                                return (
                                  <li
                                    key={`Forbidden-error-details-${index + 1}-${fieldIndex + 1}`}
                                  >
                                    <span className="font-bold capitalize">
                                      {formattedFieldName}
                                    </span>{" "}
                                    <span className="text-mineshaft-200">equal to</span>{" "}
                                    <span className="text-yellow-600">{operators}</span>
                                  </li>
                                );
                              }

                              return Object.keys(operators).map((operator, operatorIndex) => (
                                <li
                                  key={`Forbidden-error-details-${index + 1}-${
                                    fieldIndex + 1
                                  }-${operatorIndex + 1}`}
                                >
                                  <span className="font-bold capitalize">{formattedFieldName}</span>{" "}
                                  <span className="text-mineshaft-200">
                                    {
                                      formatedConditionsOperatorNames[
                                        operator as PermissionConditionOperators
                                      ]
                                    }
                                  </span>{" "}
                                  <span className="text-yellow-600">
                                    {operators[operator as PermissionConditionOperators].toString()}
                                  </span>
                                </li>
                              ));
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ModalContent>
            </Modal>
          ) : undefined,
          copyActions: [
            {
              value: serverResponse.reqId,
              name: "Request ID",
              label: `Request ID: ${serverResponse.reqId}`
            }
          ]
        },
        { closeOnClick: false }
      );
      return;
    }
    createNotification({
      title: "Bad Request",
      type: "error",
      text: `${serverResponse.message}${serverResponse.message?.endsWith(".") ? "" : "."}`,
      copyActions: [
        {
          value: serverResponse.reqId,
          name: "Request ID",
          label: `Request ID: ${serverResponse.reqId}`
        }
      ]
    });
  }
};

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: onRequestError
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

// memory token storage will be moved to apiRequest module until securityclient is completely depreciated
// then all the getters will be also hidden scoped to apiRequest only
const MemoryTokenStorage = () => {
  let authToken: string;

  return {
    setToken: (token: string) => {
      authToken = token;
    },
    getToken: () => authToken
  };
};

const signUpTempTokenStorage = MemoryTokenStorage();
const mfaAuthTokenStorage = MemoryTokenStorage();
const authTokenStorage = MemoryTokenStorage();

// set token in memory cache
export const setSignupTempToken = signUpTempTokenStorage.setToken;

export const setMfaTempToken = mfaAuthTokenStorage.setToken;

export const setAuthToken = authTokenStorage.setToken;

export const getSignupTempToken = signUpTempTokenStorage.getToken;
export const getMfaTempToken = mfaAuthTokenStorage.getToken;
export const getAuthToken = authTokenStorage.getToken;

export const isLoggedIn = () => Boolean(getAuthToken());
