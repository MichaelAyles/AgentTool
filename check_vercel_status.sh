#\!/bin/bash

echo "=== Vibe Code Deployment Status ==="
echo

# Get latest deployment
echo "📦 Latest Deployments:"
gh api repos/MichaelAyles/AgentTool/deployments | jq -r '.[:3] | .[] | "• \(.id) - \(.environment) - \(.created_at) - \(.description // "No description")"'
echo

# Get latest deployment status
LATEST_DEPLOYMENT=$(gh api repos/MichaelAyles/AgentTool/deployments | jq -r '.[0].id')
echo "🔍 Latest Deployment Status (ID: $LATEST_DEPLOYMENT):"
gh api repos/MichaelAyles/AgentTool/deployments/$LATEST_DEPLOYMENT/statuses | jq -r '.[0] | "Status: \(.state)\nDescription: \(.description)\nURL: \(.target_url)\nCreated: \(.created_at)"'
echo

# Get CI/CD status
echo "🔧 Latest CI/CD Runs:"
gh run list --limit 3 | while read status conclusion title workflow branch trigger id duration created; do
    echo "• $title - $status ($conclusion) - $created"
done
echo

# Check for Vercel-specific checks
echo "✅ Vercel Checks:"
gh api repos/MichaelAyles/AgentTool/commits/main/check-runs | jq -r '.check_runs[] | select(.app.name == "Vercel" or .name | contains("vercel") or .name | contains("Vercel")) | "• \(.name) - \(.status) (\(.conclusion // "pending"))"' || echo "No Vercel checks found"

echo
echo "=== Summary ==="
if gh api repos/MichaelAyles/AgentTool/deployments/$(gh api repos/MichaelAyles/AgentTool/deployments | jq -r '.[0].id')/statuses | jq -r '.[0].state' | grep -q "success"; then
    echo "✅ Deployment: SUCCESS"
else
    echo "❌ Deployment: FAILED"
fi

if gh run list --limit 1 | grep -q "completed.*success"; then
    echo "✅ CI/CD: PASSING"
else
    echo "❌ CI/CD: FAILING"
fi
