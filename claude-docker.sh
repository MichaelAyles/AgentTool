#!/bin/bash
# Claude Code Docker Wrapper
docker run --rm -it \
  -v "$PWD:/workspace" \
  -w /workspace \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  node:18-slim \
  sh -c "npm install -g @anthropic-ai/claude-code && claude-code $*"
