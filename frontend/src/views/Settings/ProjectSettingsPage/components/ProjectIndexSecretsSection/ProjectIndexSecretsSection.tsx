import { Button } from "@app/components/v2";

// TODO: add check so that this only shows up if user is
// an admin in the workspace
    
type Props = {
    onEnableBlindIndices: () => Promise<void>;
}

export const ProjectIndexSecretsSection = ({
    onEnableBlindIndices
}: Props) => {
    return (
        <div className="rounded-md bg-mineshaft-900 p-6 my-2">
            <p className="mb-4 text-xl font-semibold">Blind Indices</p>
            <p className="mb-4 text-sm text-gray-400">
                Your project, created before the introduction of blind indexing, contains unindexed secrets. To access individual secrets by name through the SDK and public API, please enable blind indexing.
            </p>
            <p className="mb-4 text-sm text-gray-400">
                 Learn more about it here.
            </p>
            <Button
                onClick={onEnableBlindIndices}
                color="mineshaft"
                size="sm"
                type="submit"
            >
                Enable Blind Indexing
            </Button>
        </div>
    );
}