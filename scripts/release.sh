#!/bin/bash

# Vibe Code Release Script
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
RELEASE_TYPE="${1:-}"
DRY_RUN="${2:-false}"
CURRENT_BRANCH=$(git branch --show-current)
CURRENT_VERSION=$(grep '"version"' package.json | sed -E 's/.*"version": "([^"]+)".*/\1/')

# Usage function
usage() {
    echo "Usage: $0 <release_type> [dry_run]"
    echo ""
    echo "Release types:"
    echo "  patch    - Bug fixes (x.y.Z)"
    echo "  minor    - New features (x.Y.z)"
    echo "  major    - Breaking changes (X.y.z)"
    echo "  rc       - Release candidate (x.y.z-rc.N)"
    echo "  beta     - Beta release (x.y.z-beta.N)"
    echo "  alpha    - Alpha release (x.y.z-alpha.N)"
    echo ""
    echo "Options:"
    echo "  dry_run  - Show what would be done without executing (true/false)"
    echo ""
    echo "Examples:"
    echo "  $0 patch"
    echo "  $0 minor true"
    echo "  $0 major"
}

# Validate inputs
if [[ -z "$RELEASE_TYPE" ]]; then
    log_error "Release type is required"
    usage
    exit 1
fi

if [[ ! "$RELEASE_TYPE" =~ ^(patch|minor|major|rc|beta|alpha)$ ]]; then
    log_error "Invalid release type: $RELEASE_TYPE"
    usage
    exit 1
fi

# Calculate new version
calculate_version() {
    local current="$1"
    local type="$2"
    
    # Parse current version
    if [[ $current =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(-(.+))?$ ]]; then
        local major=${BASH_REMATCH[1]}
        local minor=${BASH_REMATCH[2]}
        local patch=${BASH_REMATCH[3]}
        local prerelease=${BASH_REMATCH[5]:-}
        
        case "$type" in
            "major")
                echo "$((major + 1)).0.0"
                ;;
            "minor")
                echo "$major.$((minor + 1)).0"
                ;;
            "patch")
                echo "$major.$minor.$((patch + 1))"
                ;;
            "rc"|"beta"|"alpha")
                if [[ -n "$prerelease" && "$prerelease" =~ ^${type}\.([0-9]+)$ ]]; then
                    local pre_num=${BASH_REMATCH[1]}
                    echo "$major.$minor.$patch-$type.$((pre_num + 1))"
                else
                    echo "$major.$minor.$patch-$type.1"
                fi
                ;;
        esac
    else
        log_error "Invalid version format: $current"
        exit 1
    fi
}

# Pre-flight checks
preflight_checks() {
    log_info "Running pre-flight checks..."
    
    # Check if on main branch for stable releases
    if [[ "$RELEASE_TYPE" =~ ^(patch|minor|major)$ && "$CURRENT_BRANCH" != "main" ]]; then
        log_error "Stable releases must be made from main branch (current: $CURRENT_BRANCH)"
        exit 1
    fi
    
    # Check if working directory is clean
    if [[ -n "$(git status --porcelain)" ]]; then
        log_error "Working directory is not clean. Commit or stash changes first."
        git status --short
        exit 1
    fi
    
    # Check if remote is up to date
    git fetch origin
    if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/$CURRENT_BRANCH)" ]]; then
        log_error "Local branch is not up to date with remote. Pull latest changes first."
        exit 1
    fi
    
    # Check if tests pass
    log_info "Running tests..."
    if ! bun run test; then
        log_error "Tests failed. Fix tests before releasing."
        exit 1
    fi
    
    # Check if build succeeds
    log_info "Running build..."
    if ! bun run build; then
        log_error "Build failed. Fix build errors before releasing."
        exit 1
    fi
    
    # Check if linting passes
    log_info "Running linter..."
    if ! bun run lint; then
        log_error "Linting failed. Fix linting errors before releasing."
        exit 1
    fi
    
    log_success "Pre-flight checks passed"
}

# Update version in files
update_version() {
    local new_version="$1"
    
    log_info "Updating version to $new_version..."
    
    # Update package.json
    if [[ "$DRY_RUN" != "true" ]]; then
        sed -i.bak "s/\"version\": \".*\"/\"version\": \"$new_version\"/" package.json
        rm package.json.bak
        
        # Update package.json files in packages
        find packages -name "package.json" -exec sed -i.bak "s/\"version\": \".*\"/\"version\": \"$new_version\"/" {} \;
        find packages -name "package.json.bak" -delete
        
        # Update README.md if it contains version references
        if grep -q "Version.*$CURRENT_VERSION" README.md; then
            sed -i.bak "s/Version.*$CURRENT_VERSION/Version $new_version/" README.md
            rm README.md.bak
        fi
        
        # Update CLAUDE.md if it contains version references
        if grep -q "$CURRENT_VERSION" CLAUDE.md; then
            sed -i.bak "s/$CURRENT_VERSION/$new_version/g" CLAUDE.md
            rm CLAUDE.md.bak
        fi
    else
        log_info "DRY RUN: Would update version in package.json and related files"
    fi
}

# Generate changelog
generate_changelog() {
    local new_version="$1"
    local changelog_file="CHANGELOG.md"
    
    log_info "Generating changelog..."
    
    # Get commits since last tag
    local last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    local commit_range
    
    if [[ -n "$last_tag" ]]; then
        commit_range="$last_tag..HEAD"
    else
        commit_range="HEAD"
    fi
    
    # Generate changelog entry
    local changelog_entry="## [$new_version] - $(date +%Y-%m-%d)\n\n"
    
    # Features
    local features=$(git log $commit_range --oneline --grep="feat:" --grep="feature:" | sed 's/^[a-f0-9]* /- /')
    if [[ -n "$features" ]]; then
        changelog_entry+="\n### Added\n$features\n"
    fi
    
    # Bug fixes
    local fixes=$(git log $commit_range --oneline --grep="fix:" --grep="bug:" | sed 's/^[a-f0-9]* /- /')
    if [[ -n "$fixes" ]]; then
        changelog_entry+="\n### Fixed\n$fixes\n"
    fi
    
    # Breaking changes
    local breaking=$(git log $commit_range --oneline --grep="BREAKING" | sed 's/^[a-f0-9]* /- /')
    if [[ -n "$breaking" ]]; then
        changelog_entry+="\n### BREAKING CHANGES\n$breaking\n"
    fi
    
    if [[ "$DRY_RUN" != "true" ]]; then
        # Create or update changelog
        if [[ -f "$changelog_file" ]]; then
            # Insert new entry after the header
            local temp_file=$(mktemp)
            head -n 3 "$changelog_file" > "$temp_file"
            echo -e "$changelog_entry" >> "$temp_file"
            tail -n +4 "$changelog_file" >> "$temp_file"
            mv "$temp_file" "$changelog_file"
        else
            # Create new changelog
            cat > "$changelog_file" << EOF
# Changelog

All notable changes to this project will be documented in this file.

$changelog_entry
EOF
        fi
    else
        log_info "DRY RUN: Would generate changelog entry:"
        echo -e "$changelog_entry"
    fi
}

# Create release commit and tag
create_release() {
    local new_version="$1"
    local tag_name="v$new_version"
    
    log_info "Creating release commit and tag..."
    
    if [[ "$DRY_RUN" != "true" ]]; then
        # Add all changes
        git add .
        
        # Create release commit
        git commit -m "release: $new_version

- Update version to $new_version
- Update changelog
- Prepare for release"
        
        # Create annotated tag
        git tag -a "$tag_name" -m "Release $new_version"
        
        log_success "Created release commit and tag $tag_name"
    else
        log_info "DRY RUN: Would create commit and tag $tag_name"
    fi
}

# Push release
push_release() {
    local new_version="$1"
    local tag_name="v$new_version"
    
    log_info "Pushing release to remote..."
    
    if [[ "$DRY_RUN" != "true" ]]; then
        # Push commits and tags
        git push origin "$CURRENT_BRANCH"
        git push origin "$tag_name"
        
        log_success "Pushed release to remote"
    else
        log_info "DRY RUN: Would push commit and tag to remote"
    fi
}

# Trigger GitHub Actions
trigger_deployment() {
    local new_version="$1"
    
    log_info "Triggering deployment pipeline..."
    
    if [[ "$DRY_RUN" != "true" ]]; then
        # GitHub Actions will automatically trigger on tag push
        log_info "GitHub Actions release pipeline will be triggered automatically"
        log_info "Monitor progress at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions"
    else
        log_info "DRY RUN: Would trigger GitHub Actions release pipeline"
    fi
}

# Post-release tasks
post_release() {
    local new_version="$1"
    
    log_info "Running post-release tasks..."
    
    # Update development version for pre-releases
    if [[ "$RELEASE_TYPE" =~ ^(rc|beta|alpha)$ ]]; then
        log_info "Pre-release created. No development version update needed."
    else
        log_info "Stable release created. Consider updating to next development version."
    fi
    
    # Provide next steps
    log_info "Next steps:"
    echo "  1. Monitor the deployment pipeline"
    echo "  2. Test the release in staging environment"
    echo "  3. Announce the release to the team"
    echo "  4. Update documentation if needed"
}

# Main function
main() {
    log_info "Starting release process for Vibe Code"
    log_info "Current version: $CURRENT_VERSION"
    log_info "Release type: $RELEASE_TYPE"
    log_info "Dry run: $DRY_RUN"
    
    # Calculate new version
    NEW_VERSION=$(calculate_version "$CURRENT_VERSION" "$RELEASE_TYPE")
    log_info "New version: $NEW_VERSION"
    
    # Confirm release
    if [[ "$DRY_RUN" != "true" ]]; then
        echo ""
        echo "This will create release $NEW_VERSION from branch $CURRENT_BRANCH"
        read -p "Continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Release cancelled"
            exit 0
        fi
    fi
    
    # Execute release steps
    preflight_checks
    update_version "$NEW_VERSION"
    generate_changelog "$NEW_VERSION"
    create_release "$NEW_VERSION"
    push_release "$NEW_VERSION"
    trigger_deployment "$NEW_VERSION"
    post_release "$NEW_VERSION"
    
    log_success "Release $NEW_VERSION completed successfully!"
}

# Run main function
main "$@"