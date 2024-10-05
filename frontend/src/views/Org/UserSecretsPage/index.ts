import dynamic from "next/dynamic";

export const CreditCardTab = dynamic(() => import("./components/CreditCardTab/CreditCardTab.view"))
export const SecureNoteTab =  dynamic(() => import("./components/SecureNoteTab/SecureNoteTab.view"))
export const WebLoginTab = dynamic(() => import("./components/WebLoginTab/WebLoginTab.view"))
