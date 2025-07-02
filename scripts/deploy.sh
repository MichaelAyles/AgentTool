#!/bin/bash

# Vibe Code Production Deployment Script
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
ENVIRONMENT="${1:-production}"
COMPOSE_FILE="${2:-docker-compose.prod.yml}"
ENV_FILE="${3:-.env.production}"

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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker is not running"
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available"
        exit 1
    fi
    
    # Check if environment file exists
    if [[ ! -f "$PROJECT_ROOT/$ENV_FILE" ]]; then
        log_error "Environment file $ENV_FILE not found"
        log_info "Please copy .env.production to .env and configure your settings"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Validate environment configuration
validate_environment() {
    log_info "Validating environment configuration..."
    
    source "$PROJECT_ROOT/$ENV_FILE"
    
    # Check required variables
    required_vars=(
        "POSTGRES_PASSWORD"
        "JWT_SECRET" 
        "SESSION_SECRET"
        "VITE_API_URL"
    )
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable $var is not set"
            exit 1
        fi
        
        # Check for default/placeholder values
        case "$var" in
            *PASSWORD*|*SECRET*)
                if [[ "${!var}" == *"CHANGE_ME"* ]] || [[ "${!var}" == *"your_"* ]]; then
                    log_error "Environment variable $var still contains placeholder value"
                    exit 1
                fi
                ;;
        esac
    done
    
    log_success "Environment validation passed"
}

# Build and test images
build_images() {
    log_info "Building Docker images..."
    
    cd "$PROJECT_ROOT"
    
    # Build backend
    log_info "Building backend image..."
    docker build -t vibe-code-backend:latest -f packages/backend/Dockerfile .
    
    # Build frontend
    log_info "Building frontend image..."
    docker build -t vibe-code-frontend:latest -f packages/frontend/Dockerfile \
        --build-arg VITE_API_URL="$VITE_API_URL" .
    
    log_success "Docker images built successfully"
}

# Run health checks
health_check() {
    log_info "Running health checks..."
    
    # Wait for services to be healthy
    max_attempts=30
    attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if docker-compose -f "$COMPOSE_FILE" ps | grep -q "healthy"; then
            log_success "Services are healthy"
            return 0
        fi
        
        log_info "Waiting for services to become healthy... (attempt $((attempt + 1))/$max_attempts)"
        sleep 10
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    docker-compose -f "$COMPOSE_FILE" ps
    docker-compose -f "$COMPOSE_FILE" logs --tail=50
    return 1
}

# Backup current deployment
backup_current() {
    log_info "Creating backup of current deployment..."
    
    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_dir="$PROJECT_ROOT/backups/deployment_$timestamp"
    
    mkdir -p "$backup_dir"
    
    # Backup database
    if docker-compose -f "$COMPOSE_FILE" ps postgres | grep -q "Up"; then
        log_info "Backing up database..."
        docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U vibecode vibecode > "$backup_dir/database.sql"
    fi
    
    # Backup application data
    if [[ -d "$PROJECT_ROOT/data" ]]; then
        cp -r "$PROJECT_ROOT/data" "$backup_dir/"
    fi
    
    log_success "Backup created at $backup_dir"
}

# Deploy application
deploy() {
    log_info "Starting deployment..."
    
    cd "$PROJECT_ROOT"
    
    # Load environment variables
    export $(grep -v '^#' "$ENV_FILE" | xargs)
    
    # Stop existing services
    log_info "Stopping existing services..."
    docker-compose -f "$COMPOSE_FILE" down --remove-orphans
    
    # Pull latest images for external services
    log_info "Pulling latest images..."
    docker-compose -f "$COMPOSE_FILE" pull
    
    # Start core services first
    log_info "Starting core services..."
    docker-compose -f "$COMPOSE_FILE" up -d redis postgres
    
    # Wait for core services to be ready
    sleep 30
    
    # Start application services
    log_info "Starting application services..."
    docker-compose -f "$COMPOSE_FILE" up -d backend frontend nginx
    
    # Start monitoring services
    log_info "Starting monitoring services..."
    docker-compose -f "$COMPOSE_FILE" up -d prometheus grafana elasticsearch logstash kibana
    
    # Start system monitoring
    log_info "Starting system monitoring..."
    docker-compose -f "$COMPOSE_FILE" up -d node-exporter cadvisor
    
    # Start backup service
    log_info "Starting backup service..."
    docker-compose -f "$COMPOSE_FILE" up -d backup
    
    log_success "Deployment completed"
}

# Post-deployment verification
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check service status
    docker-compose -f "$COMPOSE_FILE" ps
    
    # Test API endpoints
    log_info "Testing API endpoints..."
    
    # Health check
    if curl -f -s "http://localhost:3000/health" > /dev/null; then
        log_success "Backend health check passed"
    else
        log_error "Backend health check failed"
        return 1
    fi
    
    # Frontend check
    if curl -f -s "http://localhost:80" > /dev/null; then
        log_success "Frontend check passed"
    else
        log_error "Frontend check failed"
        return 1
    fi
    
    # Monitoring checks
    if curl -f -s "http://localhost:9090/api/v1/status/config" > /dev/null; then
        log_success "Prometheus check passed"
    else
        log_warning "Prometheus check failed"
    fi
    
    if curl -f -s "http://localhost:3001/api/health" > /dev/null; then
        log_success "Grafana check passed"
    else
        log_warning "Grafana check failed"
    fi
    
    log_success "Deployment verification completed"
}

# Rollback function
rollback() {
    log_warning "Rolling back deployment..."
    
    # Stop current services
    docker-compose -f "$COMPOSE_FILE" down
    
    # Restore from latest backup
    latest_backup=$(ls -t "$PROJECT_ROOT/backups/deployment_"* | head -n1)
    if [[ -n "$latest_backup" ]]; then
        log_info "Restoring from backup: $latest_backup"
        
        # Restore database
        if [[ -f "$latest_backup/database.sql" ]]; then
            docker-compose -f "$COMPOSE_FILE" up -d postgres
            sleep 30
            docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U vibecode -d vibecode < "$latest_backup/database.sql"
        fi
        
        # Restore application data
        if [[ -d "$latest_backup/data" ]]; then
            rm -rf "$PROJECT_ROOT/data"
            cp -r "$latest_backup/data" "$PROJECT_ROOT/"
        fi
    fi
    
    log_success "Rollback completed"
}

# Cleanup old deployments
cleanup() {
    log_info "Cleaning up old deployments..."
    
    # Remove old images
    docker image prune -f
    
    # Remove old volumes (be careful!)
    # docker volume prune -f
    
    # Clean old backups (keep last 10)
    find "$PROJECT_ROOT/backups/deployment_"* -maxdepth 0 -type d | sort -r | tail -n +11 | xargs rm -rf
    
    log_success "Cleanup completed"
}

# Main deployment function
main() {
    log_info "Starting Vibe Code deployment (Environment: $ENVIRONMENT)"
    
    case "${1:-deploy}" in
        "check")
            check_prerequisites
            validate_environment
            ;;
        "build")
            check_prerequisites
            validate_environment
            build_images
            ;;
        "deploy")
            check_prerequisites
            validate_environment
            build_images
            backup_current
            deploy
            health_check
            verify_deployment
            cleanup
            ;;
        "rollback")
            rollback
            ;;
        "status")
            docker-compose -f "$COMPOSE_FILE" ps
            ;;
        "logs")
            docker-compose -f "$COMPOSE_FILE" logs -f "${2:-}"
            ;;
        "stop")
            docker-compose -f "$COMPOSE_FILE" down
            ;;
        "restart")
            docker-compose -f "$COMPOSE_FILE" restart "${2:-}"
            ;;
        *)
            echo "Usage: $0 {deploy|check|build|rollback|status|logs|stop|restart} [service]"
            echo ""
            echo "Commands:"
            echo "  deploy   - Full deployment process"
            echo "  check    - Check prerequisites and configuration"
            echo "  build    - Build Docker images"
            echo "  rollback - Rollback to previous deployment"
            echo "  status   - Show service status"
            echo "  logs     - Show service logs"
            echo "  stop     - Stop all services"
            echo "  restart  - Restart services"
            exit 1
            ;;
    esac
}

# Trap errors and perform cleanup
trap 'log_error "Deployment failed at line $LINENO"' ERR

# Run main function
main "$@"