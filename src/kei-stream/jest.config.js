/**
 * Jest-Konfiguration für KEI-Stream Tests
 * 
 * Konfiguriert Jest für umfassende Tests der KEI-Stream-Features:
 * - TypeScript-Unterstützung
 * - Browser-API-Mocks
 * - Coverage-Reporting
 * - Test-Setup und Teardown
 * 
 * @version 1.0.0
 */

module.exports = {
  // Test-Umgebung
  testEnvironment: 'jsdom',
  
  // Test-Dateien
  testMatch: [
    '<rootDir>/__tests__/**/*.test.ts',
    '<rootDir>/__tests__/**/*.test.tsx',
  ],
  
  // Setup-Dateien
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/setup.ts',
  ],
  
  // TypeScript-Transformation
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  
  // Module-Auflösung
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/../$1',
  },
  
  // Dateierweiterungen
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
  ],
  
  // Coverage-Konfiguration
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/__tests__/**',
    '!**/node_modules/**',
    '!**/jest.config.js',
  ],
  
  // Coverage-Schwellenwerte
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    // Spezifische Schwellenwerte für kritische Module
    './client.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './sse-client.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './token-bucket.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './compression.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './tracing.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  
  // Coverage-Reporter
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json',
  ],
  
  // Coverage-Ausgabeverzeichnis
  coverageDirectory: '<rootDir>/coverage',
  
  // Test-Timeout
  testTimeout: 10000,
  
  // Verbose-Ausgabe
  verbose: true,
  
  // Globals für Tests
  globals: {
    'ts-jest': {
      tsconfig: {
        compilerOptions: {
          module: 'commonjs',
          target: 'es2020',
          lib: ['es2020', 'dom'],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          moduleResolution: 'node',
          allowSyntheticDefaultImports: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
        },
      },
    },
  },
  
  // Browser-API-Mocks
  setupFiles: [
    '<rootDir>/__tests__/setup.ts',
  ],
  
  // Test-Umgebungsoptionen
  testEnvironmentOptions: {
    url: 'http://localhost:3000',
  },
  
  // Ignorierte Pfade
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
  ],
  
  // Watch-Modus-Konfiguration
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
  ],
  
  // Error-Handling
  errorOnDeprecated: true,
  
  // Cache-Konfiguration
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Parallel-Tests
  maxWorkers: '50%',
  
  // Test-Reporter
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: '<rootDir>/coverage/html-report',
        filename: 'report.html',
        expand: true,
      },
    ],
  ],
  
  // Custom-Matcher
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/setup.ts',
  ],
};
