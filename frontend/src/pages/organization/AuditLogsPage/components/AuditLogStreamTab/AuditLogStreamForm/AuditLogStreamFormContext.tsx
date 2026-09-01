import { createContext, useContext } from "react";

type AuditLogStreamFormContextValue = {
  /**
   * Closes the surrounding Sheet. Used by each provider form's Cancel button so the footer does not
   * have to thread a prop through every provider form.
   */
  onCancel: () => void;
};

const AuditLogStreamFormContext = createContext<AuditLogStreamFormContextValue>({
  onCancel: () => {}
});

export const AuditLogStreamFormProvider = AuditLogStreamFormContext.Provider;

export const useAuditLogStreamForm = () => useContext(AuditLogStreamFormContext);
