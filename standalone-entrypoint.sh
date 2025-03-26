#!/bin/sh

update-ca-certificates

exec node --enable-source-maps dist/main.mjs
