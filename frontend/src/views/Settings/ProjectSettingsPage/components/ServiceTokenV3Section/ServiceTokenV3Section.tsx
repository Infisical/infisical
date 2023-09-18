import { AddServiceTokenV3Modal } from "./AddServiceTokenV3Modal";
import { ServiceTokenV3Table } from "./ServiceTokenV3Table";

export const ServiceTokenV3Section = () => {
    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <p className="text-xl font-semibold text-mineshaft-100">
            Service Tokens 2.0
          </p>
          <ServiceTokenV3Table />
          <AddServiceTokenV3Modal />
        </div>
    );
}