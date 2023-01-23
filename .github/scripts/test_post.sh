#!/usr/bin/env sh
set -e

if [ ! -f .npmrc ]; then
  echo "The npmrc file should exist!"
  exit 1
fi