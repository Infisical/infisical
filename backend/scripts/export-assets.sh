#!/bin/sh
# Export frontend static assets for CDN deployment
# Usage:
#   npm run assets:export              - Output tar to stdout (pipe to file or aws s3)
#   npm run assets:export /path        - Extract assets to specified directory
#   npm run assets:export -- --help    - Show usage

set -e

ASSETS_PATH="/backend/frontend-build/assets"

show_help() {
    cat << 'EOF'
Export frontend static assets for CDN deployment.

USAGE:
    docker run --rm infisical/infisical npm run --silent assets:export [-- OPTIONS] [PATH]

OPTIONS:
    --help, -h    Show this help message

ARGUMENTS:
    PATH          Directory to export assets to. If not provided, outputs
                  a tar archive to stdout.

NOTE:
    Use --silent flag to suppress npm output when piping to stdout.

EXAMPLES:
    # Export as tar to local file
    docker run --rm infisical/infisical npm run --silent assets:export > assets.tar

    # Extract to local directory
    docker run --rm -v $(pwd)/cdn-assets:/output infisical/infisical npm run --silent assets:export /output

EOF
    exit 0
}

# Check for help flag
case "${1:-}" in
    --help|-h)
        show_help
        ;;
esac

# Verify assets exist
if [ ! -d "$ASSETS_PATH" ]; then
    echo "Error: Assets directory not found at $ASSETS_PATH" >&2
    echo "Make sure the frontend is built and included in the image." >&2
    exit 1
fi

ASSET_COUNT=$(find "$ASSETS_PATH" -type f | wc -l | tr -d ' ')

if [ $# -eq 0 ]; then
    # No path provided - output tar to stdout
    echo "Exporting $ASSET_COUNT assets as tar archive to stdout..." >&2
    tar -cf - -C "$(dirname "$ASSETS_PATH")" "$(basename "$ASSETS_PATH")"
else
    # Path provided - extract to directory
    OUTPUT_PATH="$1"
    
    if [ ! -d "$OUTPUT_PATH" ]; then
        echo "Creating output directory: $OUTPUT_PATH" >&2
        mkdir -p "$OUTPUT_PATH"
    fi
    
    echo "Exporting $ASSET_COUNT assets to $OUTPUT_PATH..." >&2
    cp -r "$ASSETS_PATH"/* "$OUTPUT_PATH/"
    
    echo "✅ Assets exported successfully!" >&2
    echo "   Path: $OUTPUT_PATH" >&2
    echo "   Files: $ASSET_COUNT assets" >&2
fi
