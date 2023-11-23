import { motion } from "framer-motion";

import { 
    ServiceTokenV3Section
} from "./components";

export const ServiceAccountTab = () => {
    return (
        <motion.div
            key="panel-service-token"
            transition={{ duration: 0.15 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
        >
            <ServiceTokenV3Section />
        </motion.div>
    );
}