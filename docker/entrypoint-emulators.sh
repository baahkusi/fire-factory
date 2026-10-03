#!/bin/sh
set -eu

echo "[emulators] Installing functions workspace dependencies..."
npm install --workspace=functions --no-audit --no-fund

echo "[emulators] Building Cloud Functions..."
npm run build --workspace=functions

echo "[emulators] Starting Firebase Emulator Suite (auth, firestore, functions, storage)..."
exec firebase emulators:start --only auth,firestore,functions,storage
