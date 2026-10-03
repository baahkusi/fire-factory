#!/bin/sh
# Host Firebase Emulator Suite. Firestore and Storage need Java 17+.
# If the host has no Java, Docker is the supported path.
set -eu

repo_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

java_works() {
  java -version >/dev/null 2>&1
}

if ! java_works; then
  for candidate in \
    "${JAVA_HOME:-}" \
    /usr/local/opt/openjdk@17 \
    /opt/homebrew/opt/openjdk@17 \
    /usr/local/opt/openjdk \
    /opt/homebrew/opt/openjdk
  do
    [ -n "$candidate" ] || continue
    if [ -x "$candidate/bin/java" ]; then
      export JAVA_HOME="$candidate"
      export PATH="$JAVA_HOME/bin:$PATH"
      break
    fi
  done
fi

if java_works; then
  exec npx firebase emulators:start --only auth,firestore,functions,storage
fi

if docker info >/dev/null 2>&1; then
  echo "No usable host Java. Starting the Emulator Suite in Docker."
  exec docker compose -f docker-compose.test.yaml up --build
fi

echo "Firebase emulators need Java 17+ or Docker." >&2
echo "  brew install openjdk@17" >&2
echo "  or: npm run emulators:up" >&2
echo "  UI-only, in-memory API: npm run dev" >&2
exit 1
