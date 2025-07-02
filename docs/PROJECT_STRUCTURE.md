# Vibe Code Project Structure

## Monorepo Layout

```
vibecode/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   ├── api/
│   │   │   ├── services/
│   │   │   ├── websocket/
│   │   │   ├── security/
│   │   │   └── index.ts
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   ├── stores/
│   │   │   ├── styles/
│   │   │   └── App.tsx
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── adapter-sdk/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/
│       ├── src/
│       │   ├── types/
│       │   └── utils/
│       └── package.json
│
├── adapters/
│   ├── claude-code/
│   ├── gemini-cli/
│   └── template/
│
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── docker-compose.yml
│
├── scripts/
│   ├── setup.sh
│   ├── build.sh
│   └── deploy.sh
│
├── docs/
│   ├── getting-started.md
│   ├── adapter-development.md
│   └── api-reference.md
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── .gitignore
└── README.md
```

## Key Configuration Files

### Root package.json

```json
{
  "name": "vibecode",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["packages/*", "adapters/*"],
  "scripts": {
    "dev": "pnpm run --parallel dev",
    "build": "pnpm run --recursive build",
    "test": "pnpm run --recursive test",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit",
    "prepare": "husky install"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0",
    "husky": "^8.0.0",
    "lint-staged": "^14.0.0"
  }
}
```

### Backend package.json

```json
{
  "name": "@vibecode/backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest"
  },
  "dependencies": {
    "express": "^4.18.0",
    "socket.io": "^4.6.0",
    "node-pty": "^1.0.0",
    "bullmq": "^4.0.0",
    "simple-git": "^3.19.0",
    "zod": "^3.22.0",
    "@vibecode/shared": "workspace:*",
    "@vibecode/adapter-sdk": "workspace:*"
  }
}
```

### Frontend package.json

```json
{
  "name": "@vibecode/frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.4.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    "socket.io-client": "^4.6.0",
    "@vibecode/shared": "workspace:*"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.3.0"
  }
}
```

## Backend Structure Details

### API Routes

```typescript
// packages/backend/src/api/routes/index.ts
export const setupRoutes = (app: Express) => {
  app.use('/api/projects', projectRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/adapters', adapterRoutes);
  app.use('/api/git', gitRoutes);
  app.use('/api/mcp', mcpRoutes);
  app.use('/api/settings', settingsRoutes);
};
```

### Service Layer

```typescript
// packages/backend/src/services/index.ts
export * from './project.service';
export * from './session.service';
export * from './adapter.service';
export * from './git.service';
export * from './process.service';
export * from './mcp.service';
```

## Frontend Structure Details

### Component Organization

```
components/
├── common/
│   ├── Button.tsx
│   ├── Modal.tsx
│   └── LoadingSpinner.tsx
├── layout/
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   └── MainLayout.tsx
├── project/
│   ├── ProjectList.tsx
│   ├── ProjectCard.tsx
│   └── CreateProjectModal.tsx
├── terminal/
│   ├── Terminal.tsx
│   ├── TerminalTabs.tsx
│   └── TerminalSettings.tsx
├── git/
│   ├── BranchSelector.tsx
│   ├── CommitHistory.tsx
│   └── GitStatus.tsx
└── settings/
    ├── AdapterSettings.tsx
    ├── SecuritySettings.tsx
    └── GeneralSettings.tsx
```

### Store Structure

```typescript
// packages/frontend/src/stores/index.ts
export { useProjectStore } from './project.store';
export { useSessionStore } from './session.store';
export { useTerminalStore } from './terminal.store';
export { useSettingsStore } from './settings.store';
```

## Shared Types

```typescript
// packages/shared/src/types/index.ts
export * from './project.types';
export * from './session.types';
export * from './adapter.types';
export * from './git.types';
export * from './mcp.types';
```

## Development Workflow

### Initial Setup

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env

# Start development servers
pnpm dev
```

### Adding a New Adapter

```bash
# Use the adapter template
cp -r adapters/template adapters/my-new-adapter

# Install adapter dependencies
cd adapters/my-new-adapter
pnpm install

# Link to main project
pnpm link
```

### Testing Strategy

```
tests/
├── unit/
│   ├── adapters/
│   ├── services/
│   └── utils/
├── integration/
│   ├── api/
│   └── websocket/
└── e2e/
    ├── project-flow.spec.ts
    └── terminal-interaction.spec.ts
```

## Build & Deployment

### Docker Compose

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: docker/Dockerfile.backend
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/vibecode
    volumes:
      - ./projects:/app/projects
      - ./adapters:/app/adapters
    depends_on:
      - db
      - redis

  frontend:
    build:
      context: .
      dockerfile: docker/Dockerfile.frontend
    ports:
      - '5173:80'
    depends_on:
      - backend

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=vibecode
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Production Build

```bash
# Build all packages
pnpm build

# Build Docker images
docker compose build

# Deploy
docker compose up -d
```
