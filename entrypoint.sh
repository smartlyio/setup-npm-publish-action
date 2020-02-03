#!/bin/bash

set -euo pipefail

# Setup authentication for npm and mark the file as non-changed

if [ -n "$AUTH_TOKEN_STRING" ]
then
    echo -e "$AUTH_TOKEN_STRING" >> .npmrc
    git update-index --assume-unchanged .npmrc
fi

# The script is run as root so we need to allow npm to execute scripts as root.
echo "unsafe-perm = true" >> ~/.npmrc

# Setup SSH keys so we can push commits and tags to master branch
mkdir -p $GITHUB_WORKSPACE/.ssh
ssh-keyscan -t rsa github.com > $GITHUB_WORKSPACE/.ssh/known_hosts
echo "$GIT_DEPLOY_KEY" > $GITHUB_WORKSPACE/.ssh/id_rsa
chmod 400 $GITHUB_WORKSPACE/.ssh/id_rsa

# Setup git
git config user.email "$INPUT_EMAIL"
git config user.name "$INPUT_USERNAME"
git config core.sshCommand 'ssh -i $GITHUB_WORKSPACE/.ssh/id_rsa -o UserKnownHostsFile=$GITHUB_WORKSPACE/.ssh/known_hosts'

git remote set-url origin git@github.com:$GITHUB_REPOSITORY.git
