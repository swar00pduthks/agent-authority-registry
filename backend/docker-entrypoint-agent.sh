#!/bin/sh
# Wait for the registry, read the agent token and public key the init step wrote, then start LangGraph.
set -e
until [ -f /data/.registry_tokens.json ]; do echo "waiting for registry init"; sleep 2; done
export REGISTRY_TOKEN=$(python -c "import json;print(json.load(open('/data/.registry_tokens.json'))['agent-guide'])")
until python - <<'P'
import os, urllib.request, sys
r = urllib.request.Request(os.environ["REGISTRY_URL"] + "/v1/signing-key", headers={"Authorization": "Bearer " + os.environ["REGISTRY_TOKEN"]})
import json
open("/tmp/registry_pubkey.pem", "w").write(json.load(urllib.request.urlopen(r))["public_key"])
P
do echo "waiting for registry"; sleep 2; done
export REGISTRY_PUBKEY_FILE=/tmp/registry_pubkey.pem
exec langgraph dev --host 0.0.0.0 --port 2024 --no-browser --no-reload --allow-blocking --config "${LANGGRAPH_CONFIG:-langgraph.json}"
