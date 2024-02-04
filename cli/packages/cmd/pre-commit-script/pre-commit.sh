#!/bin/sh

# MANAGED BY INFISICAL CLI (Do not modify): START
infisicalScanEnabled=$(git config --bool hooks.infisical-scan)

if [ "$infisicalScanEnabled" != "false" ]; then
    infisical scan git-changes -v --staged
    exitCode=$?
    if [ $exitCode -eq 1 ]; then
        echo "Commit blocked: Infisical scan has uncovered secrets in your git commit"
        echo "To disable the Infisical scan precommit hook run the following command:"
        echo ""
        echo "    git config hooks.infisical-scan false"
        echo ""
        exit 1
    fi
else
    echo 'Warning: infisical scan precommit disabled'
fi
# MANAGED BY INFISICAL CLI (Do not modify): END