# Keiko Frontend Application

React-based frontend application for the Keiko Personal Assistant platform.

## Architecture

- **React 18** with TypeScript
- **Vite** Build System
- **Auto-generated API Clients** from OpenAPI specs
- **Zustand** for state management
- **API-first Integration** with backend

## Quick Start

```bash
# Install dependencies
npm install

# Generate API clients from contracts
npm run generate:api-clients

# Start development server
npm run dev
```

## Development

### API Client Generation

```bash
# Generate clients from API contracts
npm run generate:api-clients
```

This will generate:
- REST API clients in `src/api/generated/`
- WebSocket event types in `src/api/events/`
- TypeScript types in `src/types/api.ts`

### Project Structure

- `src/components/` - React components
- `src/pages/` - Page components
- `src/hooks/` - Custom React hooks
- `src/services/` - API services
- `src/stores/` - State management (Zustand)
- `src/types/` - TypeScript type definitions

## Building

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Testing

```bash
# Run unit tests
npm test

# Run with watch mode
npm run test:watch
```
