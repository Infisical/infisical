import { CompanyNameSection } from "./CompanyNameSection";
import { InvoiceEmailSection } from "./InvoiceEmailSection";
import { PmtMethodsSection } from "./PmtMethodsSection";
import { TaxIDSection } from "./TaxIDSection";

export const BillingDetailsTab = () => {
    return (
        <>
            <CompanyNameSection />
            <InvoiceEmailSection />
            <PmtMethodsSection />
            <TaxIDSection />
        </>
    );
}