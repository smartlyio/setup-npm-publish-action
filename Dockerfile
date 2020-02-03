FROM alpine

LABEL version="1.0.0"
LABEL repository="http://github.com/smartlyio/setup-npm-publish-action"
LABEL homepage="http://github.com/setup-npm-publish-action"

LABEL com.github.actions.name="Setup npm publish action"
LABEL com.github.actions.icon="package"

USER runner

RUN apk add --no-cache bash git openssh

COPY entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
