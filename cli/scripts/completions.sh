#!/bin/sh
set -e
rm -rf completions
mkdir completions
cd cli
for sh in bash zsh fish; do
	go run . completion "$sh" > "../completions/infisical.$sh"
done