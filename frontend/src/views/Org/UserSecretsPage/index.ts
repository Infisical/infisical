import dynamic from "next/dynamic";

export const CreditCardTab = dynamic(() => import("./components/CreditCardTab"))
export const SecureNoteTab =  dynamic(() => import("./components/SecureNoteTab"))
export const WebLoginTab = dynamic(() => import("./components/WebLoginTab"))
