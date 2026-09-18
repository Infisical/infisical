import { useCallback, useEffect, useRef, useState } from "react";

import { TPasswordPolicy } from "@app/hooks/api/admin/types";

import { checkPasswordBreachStatus, PasswordBreachStatus } from "./checkIsPasswordBreached";
import { getPasswordRequirements } from "./passwordPolicy";

export type PasswordBreachCheckStatus = PasswordBreachStatus | "idle" | "checking";

type PasswordBreachResult = {
  password: string;
  status: PasswordBreachStatus;
};

type PasswordBreachRequest = {
  password: string;
  promise: Promise<PasswordBreachStatus>;
};

export const usePasswordBreachCheck = ({
  password,
  policy,
  debounceMs = 800
}: {
  password: string;
  policy: TPasswordPolicy;
  debounceMs?: number;
}) => {
  const [status, setStatus] = useState<PasswordBreachCheckStatus>("idle");
  const latestRequestRef = useRef(0);
  const lastResultRef = useRef<PasswordBreachResult>();
  const activeRequestRef = useRef<PasswordBreachRequest>();

  const getBreachStatus = useCallback((value: string) => {
    if (activeRequestRef.current?.password === value) {
      return activeRequestRef.current.promise;
    }

    const promise = checkPasswordBreachStatus(value).finally(() => {
      if (activeRequestRef.current?.promise === promise) {
        activeRequestRef.current = undefined;
      }
    });
    activeRequestRef.current = { password: value, promise };

    return promise;
  }, []);

  const validatePassword = useCallback(
    async (value: string) => {
      if (lastResultRef.current?.password === value) {
        setStatus(lastResultRef.current.status);
        return lastResultRef.current.status;
      }

      const requestId = latestRequestRef.current + 1;
      latestRequestRef.current = requestId;
      setStatus("checking");

      const nextStatus = await getBreachStatus(value);
      lastResultRef.current = { password: value, status: nextStatus };

      if (latestRequestRef.current === requestId) {
        setStatus(nextStatus);
      }

      return nextStatus;
    },
    [getBreachStatus]
  );

  useEffect(() => {
    const meetsPolicy = getPasswordRequirements(password, policy).every(({ isMet }) => isMet);

    if (!password || !meetsPolicy) {
      latestRequestRef.current += 1;
      setStatus("idle");
      return undefined;
    }

    if (lastResultRef.current?.password === password) {
      setStatus(lastResultRef.current.status);
      return undefined;
    }

    setStatus("checking");
    const timeout = window.setTimeout(() => {
      validatePassword(password).catch(() => setStatus("unavailable"));
    }, debounceMs);

    return () => {
      window.clearTimeout(timeout);
      latestRequestRef.current += 1;
    };
  }, [debounceMs, password, policy, validatePassword]);

  return { breachStatus: status, validatePassword };
};
