# CLAUDE.md - keiko-face Frontend Team

This file provides comprehensive guidance for the **keiko-face Frontend Team** and their Claude Code agents when working on the human interface layer of the Keiko Multi-Agent Platform.

## Projektkontext

**keiko-face** ist der **Master Human Experience Orchestrator** des Kubernetes-basierten Multi-Agent-Systems. Als Human Interface Container stellt face die primäre Benutzerschnittstelle zwischen Menschen und der komplexen Multi-Agent-Infrastruktur dar und abstrahiert die technische Komplexität des zugrundeliegenden Systems.

**Kernverantwortung:** Ausschließlich Human-Computer-Interaction und UI/UX-Services - Multimodale Interfaces, Empathic Computing, Immersive Reality Orchestration und alle benutzerzentrierten Funktionen.

**System-Abgrenzung:**
- ✅ **WAS face MACHT:** UI/UX-Logic, Human-Computer-Interaction, User Experience
- ❌ **WAS face NICHT MACHT:** Backend-Infrastructure, API-Contract-Definitionen, Agent-Entwicklung

## Architektonische Prinzipien

### 1. **Human-Centered Design Philosophy**
- **Human-First Approach:** Alle Design-Entscheidungen priorisieren Benutzererfahrung
- **Inclusive Design:** Berücksichtigung verschiedener Fähigkeiten und Technologie-Affinitäten
- **Emotional Intelligence:** Integration emotionaler Aspekte in alle Interaktionsdesigns
- **Cognitive Ergonomics:** Optimierung für menschliche kognitive Fähigkeiten

### 2. **Responsive und Adaptive Architecture**
- **Device Agnostic:** Optimale Funktionalität auf allen Gerätetypen
- **Context Awareness:** Anpassung an Umgebungskontext und Benutzersituation
- **Progressive Enhancement:** Grundfunktionalität für alle, erweiterte Features für leistungsfähige Geräte
- **Graceful Degradation:** Kernfunktionalität auch bei technischen Einschränkungen

### 3. **Privacy und Security by Design**
- **Data Minimization:** Sammlung nur notwendiger Benutzerdaten
- **Local Processing:** Verarbeitung sensitiver Daten lokal auf dem Gerät
- **Transparent Data Usage:** Klare Kommunikation über Datenverwendung
- **User Control:** Vollständige Benutzerkontrolle über Datenschutz-Einstellungen

### 4. **Performance Excellence**
- **Sub-Second Response Times:** P95 < 100ms für UI-Interaktionen
- **Offline-First Design:** Grundfunktionalität ohne Internetverbindung
- **Progressive Loading:** Intelligente Ressourcen-Priorisierung
- **Battery Optimization:** Energieeffiziente UI-Algorithmen

## Technische Kernkomponenten

### **Empathic Computing Interface**
```typescript
// Real-Time Emotion Recognition System
interface EmotionRecognitionEngine {
  analyzeFacialExpression(imageData: ImageData): Promise<EmotionData>;
  analyzeVoiceSentiment(audioData: AudioBuffer): Promise<SentimentScore>;
  analyzeTextSentiment(text: string): Promise<TextSentiment>;
  analyzePhysiologicalSignals(biosignals: BioSignalData): Promise<StressLevel>;
}

// Adaptive Response Mechanism
class AdaptiveUIController {
  async adjustAgentPersonality(emotion: EmotionData): Promise<PersonalityConfig> {
    // Dynamically adjust agent communication style
    // Based on user emotional state
  }
  
  async modifyUIForStressReduction(stressLevel: StressLevel): Promise<UITheme> {
    // Adapt colors, animations, and layout for stress mitigation
  }
}
```

**Verantwortlichkeiten:**
- Multimodal Sentiment Analysis (Gesicht, Stimme, Text, Biosignale)
- Dynamic Agent Personality Adjustment
- Stress Detection und UI-Mitigation
- Empathy-driven UI Modifications

### **Immersive Reality Orchestration System**
```typescript
// Extended Reality Integration
interface XROrchestrator {
  createMixedRealityAvatar(agentId: string): Promise<HolographicAvatar>;
  processGestureInput(gestureData: GestureEvent): Promise<AgentCommand>;
  renderSpatialAudio(audioSources: AudioSource[]): Promise<SpatialAudioResult>;
  integrateEnvironmentalContext(environment: PhysicalSpace): Promise<ContextData>;
}

// Haptic Feedback Network
class HapticController {
  async provideTactileFeedback(interaction: AgentInteraction): Promise<void> {
    // Render tactile sensations for agent communication
  }
  
  async simulateTexture(virtualObject: VirtualObject): Promise<TextureResponse> {
    // Provide realistic surface simulation
  }
}
```

**Verantwortlichkeiten:**
- Mixed Reality Agent Avatars und Holographic Projection
- Gesture-Based Interaction Processing
- Spatial Audio und 3D-Audio-Rendering
- Haptic Feedback Networks für taktile Kommunikation

### **Neuro-Adaptive Interface Technology**
```typescript
// Cognitive Load Assessment
class CognitiveLoadAnalyzer {
  async assessCognitiveLoad(
    eyeTracking: EyeTrackingData,
    responseTime: ResponseTimeMetrics,
    taskComplexity: TaskComplexityScore
  ): Promise<CognitiveLoadLevel> {
    // Analyze user cognitive capacity in real-time
  }
}

// Adaptive Interface Mechanisms
class AdaptiveInterfaceEngine {
  async adjustInformationDensity(cognitiveLoad: CognitiveLoadLevel): Promise<UIConfig> {
    // Dynamically adjust UI complexity based on user capacity
  }
  
  async optimizeForFlowState(userMetrics: UserEngagementMetrics): Promise<FlowConfig> {
    // Optimize interface for maximum productivity and flow
  }
}
```

**Verantwortlichkeiten:**
- Eye-Tracking Analysis für Cognitive Load Assessment
- Response Time Monitoring für Mental Capacity Evaluation
- Dynamic Information Density Adjustment
- Flow State Optimization für maximale Produktivität

## Schnittstellen zu anderen Subsystemen

### **Interface zu keiko-backbone (Infrastructure Layer)**
```typescript
// Infrastructure Service Consumption
interface BackboneClient {
  // Authentication Integration
  authenticateUser(credentials: UserCredentials): Promise<AuthResult>;
  validateSession(token: string): Promise<SessionStatus>;
  
  // Real-Time Event Consumption
  subscribeToEventStream(userId: string): EventStream<SystemEvent>;
  consumeAgentEvents(agentId: string): EventStream<AgentEvent>;
  
  // Agent Orchestration Requests
  executeAgentRequest(request: AgentRequest): Promise<AgentResponse>;
  getAgentStatus(agentId: string): Promise<AgentStatus>;
  
  // Health Status Visualization
  getSystemHealth(): Promise<SystemHealthStatus>;
  getPerformanceMetrics(): Promise<PerformanceMetrics>;
}
```

### **Interface zu keiko-contracts (API Authority)**
```typescript
// UI-Specific Contract Management
interface UIContractManager {
  // UI Component Contract Definitions
  defineComponentContract(component: UIComponent): Promise<ComponentContract>;
  validateComponentInteraction(interaction: ComponentInteraction): Promise<ValidationResult>;
  
  // User Interaction Protocol Specifications
  registerInteractionPattern(pattern: InteractionPattern): Promise<ProtocolId>;
  validateUserFlow(flow: UserFlow): Promise<FlowValidationResult>;
  
  // Frontend-Backend Communication Contracts
  generateAPIClient(backendContract: BackendContract): Promise<TypedAPIClient>;
  validateAPIResponse(response: APIResponse, contract: APIContract): Promise<ValidationResult>;
}
```

### **Interface zu keiko-agent-py-sdk (Development Gateway)**
```typescript
// Third-Party Agent UI Integration
interface AgentUIIntegrator {
  // Dynamic UI Generation for New Agents
  generateAgentInterface(agentCapabilities: AgentCapabilities): Promise<DynamicUI>;
  renderCustomWidget(widgetSpec: WidgetSpecification): Promise<ReactComponent>;
  
  // Developer Tools Integration
  createTestingInterface(agent: SDKAgent): Promise<TestingUI>;
  visualizeAgentPerformance(metrics: AgentMetrics): Promise<PerformanceVisualization>;
}
```

## Entwicklungsrichtlinien

### **Frontend Technology Stack**
```typescript
// Core Technologies
- React 18+ with Concurrent Features and Suspense
- TypeScript 5+ for type-safe development
- Vite for build tooling and development server
- Tailwind CSS for utility-first styling

// State Management
- Zustand for lightweight state management
- TanStack Query for server state management
- Redux Toolkit for complex state scenarios
- React Context for component-level state

// UI Component Framework
interface ComponentLibrary {
  // Accessibility-first components
  Button: React.FC<ButtonProps & AccessibilityProps>;
  Input: React.FC<InputProps & A11yProps>;
  Modal: React.FC<ModalProps & ARIAProps>;
}
```

### **Code Organization**
```
keiko-face/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── empathic/     # Emotion-aware components
│   │   ├── adaptive/     # Cognitive load-adaptive components
│   │   └── immersive/    # XR/AR components
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API clients and business logic
│   ├── stores/           # State management
│   ├── styles/           # Global styles and themes
│   ├── utils/            # Helper functions
│   └── types/            # TypeScript type definitions
├── public/               # Static assets
├── tests/                # Test suites
├── docs/                 # Component documentation
└── storybook/           # Component stories
```

### **Component Development Standards**
```typescript
// Example: Emotion-Aware Button Component
interface EmpatheticButtonProps extends ButtonProps {
  emotionSensitive?: boolean;
  stressAdaptive?: boolean;
  cognitiveLoadAware?: boolean;
}

const EmpatheticButton: React.FC<EmpatheticButtonProps> = ({
  emotionSensitive = true,
  stressAdaptive = true,
  cognitiveLoadAware = true,
  children,
  ...props
}) => {
  const { userEmotion } = useEmotionContext();
  const { cognitiveLoad } = useCognitiveLoadContext();
  const { stressLevel } = useStressContext();
  
  // Adaptive styling based on user state
  const adaptiveStyles = useMemo(() => {
    return computeAdaptiveStyles({
      emotion: emotionSensitive ? userEmotion : null,
      cognitiveLoad: cognitiveLoadAware ? cognitiveLoad : null,
      stress: stressAdaptive ? stressLevel : null,
    });
  }, [userEmotion, cognitiveLoad, stressLevel]);
  
  return (
    <button 
      className={`${baseButtonStyles} ${adaptiveStyles}`}
      {...props}
    >
      {children}
    </button>
  );
};
```

### **Quality Standards**
```typescript
// Type Safety Requirements
- 100% TypeScript coverage (no 'any' types)
- Strict TypeScript configuration
- Runtime type validation with Zod
- API response type generation from OpenAPI specs

// Testing Requirements
- Component testing with React Testing Library
- Visual regression testing with Chromatic
- E2E testing with Playwright
- Accessibility testing with axe-core
```

## Sicherheitsanforderungen

### **Frontend Security**
```typescript
// Content Security Policy
const cspConfig = {
  defaultSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
  fontSrc: ["'self'", "fonts.gstatic.com"],
  imgSrc: ["'self'", "data:", "https:"],
  scriptSrc: ["'self'"],
  connectSrc: ["'self'", "wss:", process.env.VITE_API_URL],
};

// Secure Cookie Configuration
const secureSessionConfig = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
};
```

### **Data Protection**
```typescript
// Client-Side Encryption for Sensitive Data
class BiometricDataHandler {
  private async encryptLocally(data: BiometricData): Promise<EncryptedData> {
    // Never send raw biometric data to server
    // Process locally and send only derived insights
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    return this.encrypt(data, key);
  }
  
  async processEmotionData(faceData: ImageData): Promise<EmotionInsights> {
    // Process emotion recognition locally
    // Send only aggregated, anonymized insights
    const emotions = await this.analyzeLocally(faceData);
    return this.anonymizeEmotionData(emotions);
  }
}
```

### **Privacy Protection**
```typescript
// GDPR Compliance Implementation
class ConsentManager {
  async requestConsent(dataType: DataType): Promise<ConsentResult> {
    // Granular consent management
    // Clear explanation of data usage
    // Easy withdrawal mechanism
  }
  
  async handleRightToBeForgotten(userId: string): Promise<void> {
    // Clear all local storage
    // Notify backend of deletion request
    // Remove user data from analytics
  }
}
```

## Performance-Ziele

### **User Experience Metrics**
```typescript
// Core Web Vitals Targets
const performanceTargets = {
  // Largest Contentful Paint
  LCP: 1.2, // seconds (Good: < 2.5s)
  
  // First Input Delay  
  FID: 50, // milliseconds (Good: < 100ms)
  
  // Cumulative Layout Shift
  CLS: 0.05, // score (Good: < 0.1)
  
  // Time to Interactive
  TTI: 2.5, // seconds (Good: < 3.8s)
  
  // First Contentful Paint
  FCP: 1.0, // seconds (Good: < 1.8s)
};

// Real User Monitoring
class PerformanceMonitor {
  private observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      if (entry.entryType === 'paint') {
        this.reportMetric(entry.name, entry.startTime);
      }
    });
  });
  
  startMonitoring(): void {
    this.observer.observe({ entryTypes: ['paint', 'navigation', 'resource'] });
  }
}
```

### **Responsive Design Targets**
```css
/* Mobile-First Breakpoints */
:root {
  --breakpoint-xs: 320px;  /* Small phones */
  --breakpoint-sm: 640px;  /* Large phones */
  --breakpoint-md: 768px;  /* Tablets */
  --breakpoint-lg: 1024px; /* Small laptops */
  --breakpoint-xl: 1280px; /* Desktops */
  --breakpoint-2xl: 1536px; /* Large desktops */
}

/* Performance-optimized animations */
.smooth-animation {
  transform: translateZ(0); /* Enable hardware acceleration */
  will-change: transform;   /* Hint browser for optimization */
}
```

### **Bundle Size Optimization**
```typescript
// Code Splitting Strategy
const LazyAgentInterface = lazy(() => 
  import('./components/AgentInterface').then(module => ({
    default: module.AgentInterface
  }))
);

// Tree Shaking Configuration
const optimizedImports = {
  // Use specific imports instead of namespace imports
  import: { lodash: ['debounce', 'throttle'] },
  // Remove unused code automatically
  sideEffects: false,
};
```

## Testing-Strategien

### **Testing Pyramid for Frontend**
```typescript
// Unit Tests (70%) - Component Logic
describe('EmpatheticButton', () => {
  test('adapts style based on user emotion', () => {
    render(
      <EmotionProvider value={{ emotion: 'stressed' }}>
        <EmpatheticButton>Click Me</EmpatheticButton>
      </EmotionProvider>
    );
    
    expect(screen.getByRole('button')).toHaveClass('stress-mitigation-style');
  });
});

// Integration Tests (20%) - User Workflows
describe('Agent Interaction Flow', () => {
  test('complete user interaction with agent', async () => {
    const user = userEvent.setup();
    render(<AgentChatInterface />);
    
    await user.type(screen.getByRole('textbox'), 'Help me with task');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    
    expect(await screen.findByText(/Agent response/i)).toBeInTheDocument();
  });
});

// E2E Tests (10%) - Full User Journeys
describe('Complete User Journey', () => {
  test('user can complete complex multi-agent task', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="task-input"]', 'Complex task description');
    await page.click('[data-testid="execute-task"]');
    
    await expect(page.locator('[data-testid="task-result"]')).toBeVisible();
  });
});
```

### **Accessibility Testing**
```typescript
// Automated Accessibility Testing
import { axe } from '@axe-core/react';

describe('Accessibility Compliance', () => {
  test('component meets WCAG 2.2 AA standards', async () => {
    const { container } = render(<AgentInterface />);
    const results = await axe(container);
    
    expect(results).toHaveNoViolations();
  });
  
  test('keyboard navigation works correctly', async () => {
    render(<NavigationMenu />);
    
    // Test keyboard navigation
    await userEvent.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'Home' })).toHaveFocus();
    
    await userEvent.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'Agents' })).toHaveFocus();
  });
});
```

### **Performance Testing**
```typescript
// Bundle Size Testing
describe('Bundle Performance', () => {
  test('main bundle size is under threshold', () => {
    const bundleSize = getBundleSize('./dist/main.js');
    expect(bundleSize).toBeLessThan(250 * 1024); // 250KB
  });
  
  test('component renders within performance budget', () => {
    const renderTime = measureRenderTime(<ComplexAgentDashboard />);
    expect(renderTime).toBeLessThan(100); // 100ms
  });
});
```

## Deployment-Überlegungen

### **Build Configuration**
```typescript
// Vite Configuration
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'emotion-recognition-wasm',
      configureServer(server) {
        server.middlewares.use('/wasm', sirv('src/wasm'));
      }
    }
  ],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-components': ['./src/components'],
          'emotion-engine': ['./src/services/emotion'],
          'xr-systems': ['./src/services/immersive']
        }
      }
    }
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __VERSION__: JSON.stringify(process.env.npm_package_version)
  }
});
```

### **Progressive Web App Configuration**
```javascript
// Service Worker for Offline Functionality
self.addEventListener('fetch', (event) => {
  // Cache-first strategy for static assets
  if (event.request.url.includes('/static/')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
  
  // Network-first strategy for API calls
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
  }
});
```

### **Docker Configuration**

```dockerfile
# Multi-stage build for optimized production image
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY ../.. .
RUN npm run build

FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

# Security headers
RUN echo 'add_header X-Frame-Options DENY;' >> /etc/nginx/conf.d/security.conf
RUN echo 'add_header X-Content-Type-Options nosniff;' >> /etc/nginx/conf.d/security.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## Development Commands

### **Core Development Workflow**
```bash
# Setup Development Environment
yarn install                    # Install dependencies
yarn generate:api              # Generate API clients from backend

# Development Server
yarn dev                       # Start development server with API client generation
yarn dev:full                  # Dev server with API watching
yarn storybook                 # Start component development environment

# Code Quality
yarn lint                      # ESLint checking
yarn lint:fix                  # Auto-fix linting issues
yarn format                    # Prettier formatting
yarn check:types               # TypeScript type checking

# Testing
yarn test                      # Run test suite with Vitest
yarn test:watch               # Run tests in watch mode
yarn test:coverage            # Generate coverage report
yarn test:e2e                 # Run E2E tests with Playwright
yarn test:accessibility      # Run accessibility tests

# Build and Deployment
yarn build                     # Production build
yarn preview                   # Preview production build
yarn analyze                   # Analyze bundle size
```

### **Component Development**
```bash
# Component Generation
yarn generate:component EmpatheticCard    # Generate new component with templates
yarn generate:hook useEmotionDetection   # Generate custom hook
yarn generate:service AgentService       # Generate service module

# Storybook Development
yarn storybook                 # Start Storybook development server
yarn build-storybook         # Build static Storybook
yarn chromatic               # Visual regression testing
```

## Important Notes

### **Cross-System User Experience Coordination**
- **Unified User Journey:** Seamless experience across all four systems
- **User Context Preservation:** Maintain user state between system interactions
- **Design System Governance:** Consistent UI patterns for all system interfaces
- **Accessibility Standards:** System-wide accessibility coordination

### **Performance Optimization**
- **Code Splitting:** Dynamic imports for route and component-level splitting
- **Image Optimization:** WebP/AVIF format support with fallbacks
- **Caching Strategy:** Service worker for intelligent caching
- **Bundle Analysis:** Regular bundle size monitoring and optimization

### **Security Best Practices**
- **CSP Implementation:** Strict Content Security Policy
- **Input Sanitization:** Sanitize all user inputs
- **XSS Prevention:** Use React's built-in XSS protection
- **Secure Communications:** HTTPS everywhere, secure WebSocket connections

### **Accessibility Excellence**
- **WCAG 2.2 AA Compliance:** Meet or exceed accessibility standards
- **Screen Reader Support:** Full compatibility with assistive technologies
- **Keyboard Navigation:** Complete keyboard accessibility
- **Color Contrast:** Minimum 4.5:1 contrast ratio

The frontend team is responsible for creating an **empathetic, intuitive, and immersive** human interface that makes the complex Keiko Multi-Agent Platform accessible to all users while maintaining the highest standards of performance, security, and accessibility.