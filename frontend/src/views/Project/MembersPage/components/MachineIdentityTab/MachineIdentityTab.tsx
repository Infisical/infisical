import { motion } from "framer-motion";

import { 
    MachineIdentitySection
} from "./components";

export const MachineIdentityTab = () => {
    return (
        <motion.div
            key="panel-machine-identity"
            transition={{ duration: 0.15 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
        >
            <MachineIdentitySection />
        </motion.div>
    );
}