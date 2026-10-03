# Firebase Emulator Suite image for local development and live tests.
# Firestore and Storage emulators are JVM binaries, so the image carries Java.
# Hosts do not need a local JDK.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl openjdk-17-jre-headless \
  && rm -rf /var/lib/apt/lists/*

# Keep in sync with firebase-tools in the root package.json.
RUN npm install -g firebase-tools@14.13.0

RUN firebase setup:emulators:firestore \
  && firebase setup:emulators:storage

COPY docker/entrypoint-emulators.sh /usr/local/bin/entrypoint-emulators.sh
RUN chmod +x /usr/local/bin/entrypoint-emulators.sh

WORKDIR /app

EXPOSE 4000 4400 5001 8080 9099 9199

HEALTHCHECK --interval=5s --timeout=3s --start-period=180s --retries=60 \
  CMD curl -sf http://127.0.0.1:4400/ >/dev/null || exit 1

ENTRYPOINT ["entrypoint-emulators.sh"]
