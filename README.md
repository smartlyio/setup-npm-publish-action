
# setup-npm-publish-action

Action to setup npm and git for npm publish. It appends authentication tokens to local .npmrc file and configures git access so it can commit and push to branches. Git with SSH authentication is used so that it is possible to push to protected branches.

## Inputs

| Input    | Required  | Description
|--------------------------------------------------
| email    | no        | Email to use with git
| username | no        | Username to use with git

## Environment variables

| Variable          | Required  | Description
|----------------------------------------------------------------------------------------------
| GIT_DEPLOY_KEY    | yes       | RSA key to authenticate to git repository
| AUTH_TOKEN_STRING | no        | Authentication string that is injected to local .npmrc file
