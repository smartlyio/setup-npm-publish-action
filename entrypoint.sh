#!/bin/bash

set -euo pipefail

# Validate input

if [ -z "$GIT_DEPLOY_KEY" ]
then
    echo "No GIT_DEPLOY_KEY environment variable set"
    exit -1
fi

# Setup authentication for npm and mark the file as non-changed

if [ -n "$AUTH_TOKEN_STRING" ]
then
    echo -e "$AUTH_TOKEN_STRING" >> .npmrc
    git update-index --assume-unchanged .npmrc
fi

# The script is run as root so we need to allow npm to execute scripts as root.
echo "unsafe-perm = true" >> ~/.npmrc

# Setup SSH keys so we can push commits and tags to master branch
mkdir -p $HOME/.ssh
ssh-keyscan -t rsa github.com > $HOME/.ssh/known_hosts
echo "$GIT_DEPLOY_KEY" > $HOME/.ssh/id_rsa
chmod 400 $HOME/.ssh/id_rsa

# Setup git
git config user.email "$INPUT_EMAIL"
git config user.name "$INPUT_USERNAME"
git config core.sshCommand 'ssh -i $HOME/.ssh/id_rsa -o UserKnownHostsFile=$HOME/.ssh/known_hosts'

git remote set-url origin git@github.com:$GITHUB_REPOSITORY.git
