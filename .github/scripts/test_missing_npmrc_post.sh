#!/usr/bin/env sh
set -e

if [ -f .npmrc ]; then
  echo "The npmrc file should not exist!"
  exit 1
fi