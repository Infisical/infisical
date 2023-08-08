import {
    LogsSection
} from "./components";

export const AuditLogsPage = () => {
    return (
		<div className="flex justify-center bg-bunker-800 text-white w-full h-full">
			<div className="max-w-7xl px-6 w-full">
				<div className="my-6">
					<p className="text-3xl font-semibold text-gray-200">Audit Logs</p>
					<div />
				</div>
				<LogsSection />
			</div>
    	</div>
    );
}