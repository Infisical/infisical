import { MutationCache, QueryClient } from "@tanstack/react-query";
import axios from "axios";

import { createNotification, dismissNotification } from "@app/components/notifications";
// akhilmhdh: doing individual imports to avoid cyclic import error
import { Badge } from "@app/components/v3/generic/Badge";
import { Button } from "@app/components/v3/generic/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@app/components/v3/generic/Dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3/generic/Table";
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
  requestBody,
  toastIdRef
}: {
  serverResponse: TApiErrors;
  requestBody?: Record<string, unknown> | null;
  toastIdRef: { current: string | number | undefined };
}) {
  if (serverResponse.error !== ApiErrorTypes.ValidationError) {
    return null;
  }

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        // The modal auto-opens inside the toast, whose overlay keeps sonner's dismiss timer
        // paused while open. Dismiss the toast on close so it does not linger afterwards.
        if (!open && toastIdRef.current !== undefined) {
          dismissNotification(toastIdRef.current);
        }
      }}
    >
      {/* z-[70] keeps this dialog above v2 Modals (z-[60]) hosting the form that errored */}
      <DialogContent className="z-[70] sm:max-w-2xl" overlayClassName="z-[70]">
        <DialogHeader>
          <DialogTitle>Validation Error Details</DialogTitle>
          <DialogDescription>These fields did not pass validation.</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Issue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {serverResponse.message?.map(({ message, path }) => (
              <TableRow key={path.join(".")}>
                <TableCell className="whitespace-normal">
                  {formatValidationErrorPath(path, requestBody)}
                </TableCell>
                <TableCell className="whitespace-normal">{message.toLowerCase()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
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

      const toastIdRef: { current: string | number | undefined } = { current: undefined };
      toastIdRef.current = createNotification({
        title: "Validation Error",
        type: "error",
        text: "Please check the input and try again.",
        callToAction: (
          <ValidationErrorModal
            serverResponse={serverResponse}
            requestBody={requestBody}
            toastIdRef={toastIdRef}
          />
        ),
        copyActions: [
          {
            value: serverResponse.reqId,
            name: "Request ID",
            label: `Request ID: ${serverResponse.reqId}`
          }
        ]
      });
      return;
    }
    if (serverResponse?.error === ApiErrorTypes.ForbiddenError) {
      const toastIdRef: { current: string | number | undefined } = { current: undefined };
      toastIdRef.current = createNotification({
        title: "Forbidden Access",
        type: "error",
        text: `${serverResponse.message}.`,
        callToAction: serverResponse?.details?.length ? (
          <Dialog
            onOpenChange={(open) => {
              // The dialog renders inside the toast; its overlay pins sonner's dismiss timer
              // while open. Dismiss the toast on close so it does not linger afterwards.
              if (!open && toastIdRef.current !== undefined) {
                dismissNotification(toastIdRef.current);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="xs">
                Show more
              </Button>
            </DialogTrigger>
            {/* z-[70] keeps this dialog above v2 Modals (z-[60]) hosting the form that errored */}
            <DialogContent className="z-[70] sm:max-w-2xl" overlayClassName="z-[70]">
              <DialogHeader>
                <DialogTitle>Validation Rules</DialogTitle>
                <DialogDescription>Please review the allowed rules below.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                {serverResponse.details?.map((el, index) => {
                  const hasConditions = Boolean(Object.keys(el.conditions || {}).length);
                  const actions = Array.isArray(el.action) ? el.action : [el.action];
                  return (
                    <div
                      key={`Forbidden-error-details-${index + 1}`}
                      className="rounded-md border border-border bg-card p-4 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span>{el.inverted ? "Cannot" : "Can"}</span>
                        {actions.map((action, actionIndex) => (
                          <Badge
                            key={`Forbidden-error-details-${index + 1}-action-${actionIndex + 1}`}
                            variant={el.inverted ? "danger" : "success"}
                          >
                            {action.toString()}
                          </Badge>
                        ))}
                        <span>{el.subject.toString()}</span>
                        {hasConditions && <span className="text-muted">with conditions:</span>}
                      </div>
                      {hasConditions && (
                        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 marker:text-muted">
                          {Object.keys(el.conditions || {}).flatMap((field, fieldIndex) => {
                            const operators = (
                              el.conditions as Record<
                                string,
                                string | { [K in PermissionConditionOperators]: string | string[] }
                              >
                            )[field];

                            const formattedFieldName = camelCaseToSpaces(field).toLowerCase();
                            if (typeof operators === "string") {
                              return (
                                <li key={`Forbidden-error-details-${index + 1}-${fieldIndex + 1}`}>
                                  <span className="font-medium capitalize">
                                    {formattedFieldName}
                                  </span>{" "}
                                  <span className="text-muted">equal to</span>{" "}
                                  <Badge variant="neutral">{operators}</Badge>
                                </li>
                              );
                            }

                            return Object.keys(operators).map((operator, operatorIndex) => (
                              <li
                                key={`Forbidden-error-details-${index + 1}-${
                                  fieldIndex + 1
                                }-${operatorIndex + 1}`}
                              >
                                <span className="font-medium capitalize">{formattedFieldName}</span>{" "}
                                <span className="text-muted">
                                  {
                                    formatedConditionsOperatorNames[
                                      operator as PermissionConditionOperators
                                    ]
                                  }
                                </span>{" "}
                                <Badge variant="neutral">
                                  {operators[operator as PermissionConditionOperators].toString()}
                                </Badge>
                              </li>
                            ));
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        ) : undefined,
        copyActions: [
          {
            value: serverResponse.reqId,
            name: "Request ID",
            label: `Request ID: ${serverResponse.reqId}`
          }
        ]
      });
      return;
    }
    const errorMessage =
      serverResponse?.message || "An unexpected error occurred. Please try again.";

    createNotification({
      title: "Bad Request",
      type: "error",
      text: `${errorMessage}${errorMessage.endsWith(".") ? "" : "."}`,
      copyActions: serverResponse?.reqId
        ? [
            {
              value: serverResponse.reqId,
              name: "Request ID",
              label: `Request ID: ${serverResponse.reqId}`
            }
          ]
        : undefined
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
      retry: 1,
      staleTime: 60_000 // 60s — prevents refetch on every component mount/remount
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
