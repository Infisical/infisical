import { motion } from "framer-motion";

import { 
    ServiceTokenSection, 
} from "./components";

export const ServiceTokenTab = () => {
    return (
        <motion.div
            key="panel-service-token"
            transition={{ duration: 0.15 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
        >
            <ServiceTokenSection />
        </motion.div>
    );
}