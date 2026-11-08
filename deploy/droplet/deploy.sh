#!/bin/sh
# Starts a given API image and waits until it is healthy.
#   ./deploy.sh <image> <tag>      (GitHub Actions runs this)
#   ./deploy.sh <image> <old-tag>  (roll back to an earlier commit)
set -eu
cd "$(dirname "$0")"
IMAGE="${1:?usage: deploy.sh <image> <tag>}"
TAG="${2:?usage: deploy.sh <image> <tag>}"

# Remember the image in .env so a reboot or `docker compose up` starts the same one.
touch .env
grep -v -e '^API_IMAGE=' -e '^API_TAG=' .env > .env.next || true
printf 'API_IMAGE=%s\nAPI_TAG=%s\n' "$IMAGE" "$TAG" >> .env.next
mv .env.next .env

docker compose pull api
docker compose up -d --remove-orphans

echo "Waiting for the API to report healthy…"
i=0
while [ $i -lt 60 ]; do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q api)" 2>/dev/null || echo starting)
  if [ "$status" = healthy ]; then
    docker image prune -f >/dev/null
    echo "API $TAG is live."
    exit 0
  fi
  i=$((i + 1))
  sleep 3
done

echo "API $TAG did not become healthy. Last logs:"
docker compose logs --tail 80 api
exit 1
