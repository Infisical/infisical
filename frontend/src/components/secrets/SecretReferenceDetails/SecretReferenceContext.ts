import { createContext } from "react";

export const SecretReferenceCloseContext = createContext<(() => void) | undefined>(undefined);
