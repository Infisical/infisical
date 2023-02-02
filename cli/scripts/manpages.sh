#!/bin/sh
set -e
rm -rf manpages
mkdir manpages
cd cli
go run . man | gzip -c > "../manpages/infisical.1.gz"