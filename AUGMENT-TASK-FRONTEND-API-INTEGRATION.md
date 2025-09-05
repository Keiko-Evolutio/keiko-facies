# 🎨 Augment Entwicklungsanweisung: keiko-frontend API-Integration

## 🎯 **AUFGABE**
Passe das Frontend so an, dass es die OpenAPI-Spezifikation vom neuen `keiko-api-contracts` Container-Service holt, anstatt aus dem nicht mehr existierenden `../backend/openapi.json` Pfad.

## 📋 **PROBLEM-KONTEXT**
Das Frontend schlägt beim Start fehl:
```bash
$ yarn generate:api
ResolveError: ENOENT: no such file or directory '/Users/oscharko/PycharmProjects/keiko-development/backend/openapi.json'
```

**Aktueller Pfad:** `../backend/openapi.json` (existiert nicht mehr)  
**Neuer Service:** `http://localhost:3001/frontend/openapi.json`

## 🎯 **LÖSUNG**
Erstelle ein robustes Script, das die OpenAPI-Spec vom API-Contracts-Service holt und TypeScript-Types generiert.

---

## 📁 **DATEIEN ZU BEARBEITEN**

### **1. Package.json Scripts aktualisieren**
**Datei:** `keiko-frontend/package.json`

**Aktuelle Scripts ersetzen:**
```json
{
  "scripts": {
    "generate:api": "node scripts/generate-api-types.js",
    "generate:api:simple": "openapi-typescript http://localhost:3001/frontend/openapi.json -o src/types/api.ts && echo '✅ API types generated' || echo '⚠️  API-Contracts service not available'",
    "validate:api": "node scripts/validate-api-spec.js",
    "watch:api": "nodemon --watch http://localhost:3001/frontend/openapi.json --exec 'yarn generate:api'",
    "pre-dev": "yarn generate:api && yarn validate:api"
  },
  "config": {
    "api_contracts_service": {
      "url": "http://localhost:3001",
      "frontend_spec": "/frontend/openapi.json",
      "timeout": 30000
    }
  }
}
```

### **2. Robustes API-Types-Generator-Script**
**Datei:** `keiko-frontend/scripts/generate-api-types.js`

```javascript
#!/usr/bin/env node
/**
 * API Types Generator für Keiko Frontend
 * Holt OpenAPI-Spec vom keiko-api-contracts Service und generiert TypeScript-Types
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Konfiguration
const CONFIG = {
  // API-Contracts Service URLs (in Prioritätsreihenfolge)
  serviceUrls: [
    'http://localhost:3001/frontend/openapi.json',           // Docker Compose
    'http://keiko-api-contracts:3000/frontend/openapi.json', // Container Network
    'http://keiko-api-contracts-service.keiko:3000/frontend/openapi.json', // Kubernetes
    '../keiko-api-contracts/openapi/backend-frontend-api-v1.yaml' // Fallback: lokaler Pfad
  ],
  outputPath: 'src/types/api.ts',
  tempPath: '/tmp/keiko-frontend-openapi.json',
  timeout: 30000
};

/**
 * Prüft ob Datei existiert
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

/**
 * Lädt OpenAPI-Spec von URL
 */
async function fetchFromUrl(url) {
  try {
    console.log(`📡 Versuche OpenAPI-Spec von ${url} zu laden...`);
    
    // Dynamischer Import für fetch in Node.js
    const fetch = (await import('node-fetch')).default;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'keiko-frontend-api-generator'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const spec = await response.json();
    
    // Validiere dass es eine gültige OpenAPI-Spec ist
    if (!spec.openapi && !spec.swagger) {
      throw new Error('Invalid OpenAPI specification');
    }
    
    // Temporäre Datei erstellen
    fs.writeFileSync(CONFIG.tempPath, JSON.stringify(spec, null, 2));
    console.log(`✅ OpenAPI-Spec erfolgreich von ${url} geladen`);
    
    return CONFIG.tempPath;
  } catch (error) {
    console.log(`❌ Fehler beim Laden von ${url}: ${error.message}`);
    return null;
  }
}

/**
 * Lädt OpenAPI-Spec von lokalem Pfad
 */
function loadFromLocalPath(filePath) {
  try {
    const fullPath = path.resolve(filePath);
    if (fileExists(fullPath)) {
      console.log(`✅ OpenAPI-Spec gefunden: ${filePath}`);
      return fullPath;
    } else {
      console.log(`❌ OpenAPI-Spec nicht gefunden: ${filePath}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Fehler beim Laden von ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Findet verfügbare OpenAPI-Spec
 */
async function findOpenApiSpec() {
  console.log('🔍 Suche nach OpenAPI-Spezifikation...');
  
  for (const specUrl of CONFIG.serviceUrls) {
    if (specUrl.startsWith('http')) {
      // URL - versuche zu fetchen
      const result = await fetchFromUrl(specUrl);
      if (result) {
        return result;
      }
    } else {
      // Lokaler Pfad
      const result = loadFromLocalPath(specUrl);
      if (result) {
        return result;
      }
    }
  }
  
  return null;
}

/**
 * Generiert TypeScript-Types aus OpenAPI-Spec
 */
function generateTypes(specPath) {
  try {
    console.log('🔧 Generiere TypeScript-Types...');
    
    // Stelle sicher, dass Output-Verzeichnis existiert
    const outputDir = path.dirname(CONFIG.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const command = `npx openapi-typescript "${specPath}" -o "${CONFIG.outputPath}"`;
    execSync(command, { stdio: 'inherit' });
    
    console.log(`✅ TypeScript-Types erfolgreich generiert: ${CONFIG.outputPath}`);
    
    // Füge Header-Kommentar hinzu
    const generatedContent = fs.readFileSync(CONFIG.outputPath, 'utf8');
    const headerComment = `/**
 * Auto-generated TypeScript types from OpenAPI specification
 * Generated at: ${new Date().toISOString()}
 * Source: keiko-api-contracts service
 * 
 * DO NOT EDIT THIS FILE MANUALLY
 * Run 'yarn generate:api' to regenerate
 */

`;
    fs.writeFileSync(CONFIG.outputPath, headerComment + generatedContent);
    
    return true;
  } catch (error) {
    console.error(`❌ Fehler beim Generieren der Types: ${error.message}`);
    return false;
  }
}

/**
 * Validiert OpenAPI-Spec
 */
function validateSpec(specPath) {
  try {
    console.log('🔍 Validiere OpenAPI-Spezifikation...');
    
    const command = `npx swagger-parser validate "${specPath}"`;
    execSync(command, { stdio: 'inherit' });
    
    console.log('✅ OpenAPI-Spezifikation ist valide');
    return true;
  } catch (error) {
    console.error(`❌ OpenAPI-Spezifikation ist nicht valide: ${error.message}`);
    return false;
  }
}

/**
 * Cleanup temporäre Dateien
 */
function cleanup() {
  try {
    if (fileExists(CONFIG.tempPath)) {
      fs.unlinkSync(CONFIG.tempPath);
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Wartet auf API-Contracts Service
 */
async function waitForService(maxAttempts = 10, delay = 2000) {
  console.log('⏳ Warte auf API-Contracts Service...');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('http://localhost:3001/health', { timeout: 5000 });
      
      if (response.ok) {
        console.log('✅ API-Contracts Service ist verfügbar');
        return true;
      }
    } catch (error) {
      console.log(`⏳ Versuch ${attempt}/${maxAttempts} - Service noch nicht verfügbar`);
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.log('⚠️  API-Contracts Service nicht verfügbar, verwende Fallback');
  return false;
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🚀 Keiko Frontend API Types Generator');
  console.log('=====================================');
  
  try {
    // Warte auf Service (optional)
    await waitForService(5, 1000);
    
    // Finde OpenAPI-Spec
    const specPath = await findOpenApiSpec();
    
    if (!specPath) {
      console.error('❌ Keine OpenAPI-Spezifikation gefunden!');
      console.error('');
      console.error('Mögliche Lösungen:');
      console.error('1. Starte API-Contracts Service: cd ../keiko-api-contracts && docker build -t keiko-api-contracts . && docker run -p 3001:3000 keiko-api-contracts');
      console.error('2. Starte mit Docker Compose: docker-compose -f docker-compose.dev-multi-repo.yml up keiko-api-contracts');
      console.error('3. Prüfe ob keiko-api-contracts Repository existiert: ls ../keiko-api-contracts/');
      process.exit(1);
    }
    
    // Validiere Spec
    if (!validateSpec(specPath)) {
      console.error('❌ OpenAPI-Spezifikation ist nicht valide!');
      process.exit(1);
    }
    
    // Generiere Types
    if (!generateTypes(specPath)) {
      console.error('❌ TypeScript-Types konnten nicht generiert werden!');
      process.exit(1);
    }
    
    console.log('');
    console.log('🎉 API Types erfolgreich generiert!');
    console.log(`📁 Output: ${CONFIG.outputPath}`);
    console.log('');
    console.log('💡 Tipp: Verwende "yarn watch:api" für automatische Regenerierung');
    
  } catch (error) {
    console.error(`❌ Unerwarteter Fehler: ${error.message}`);
    process.exit(1);
  } finally {
    cleanup();
  }
}

// Script ausführen
if (require.main === module) {
  main();
}

module.exports = { main, findOpenApiSpec, generateTypes, validateSpec };
```

### **3. API-Spec-Validator-Script**
**Datei:** `keiko-frontend/scripts/validate-api-spec.js`

```javascript
#!/usr/bin/env node
/**
 * API Specification Validator für Keiko Frontend
 * Validiert die OpenAPI-Spec vom API-Contracts Service
 */

const { execSync } = require('child_process');

async function validateApiSpec() {
  try {
    console.log('🔍 Validiere API-Spezifikation...');
    
    // Versuche verschiedene Quellen
    const sources = [
      'http://localhost:3001/frontend/openapi.json',
      '../keiko-api-contracts/openapi/backend-frontend-api-v1.yaml'
    ];
    
    for (const source of sources) {
      try {
        console.log(`Validiere: ${source}`);
        execSync(`npx swagger-parser validate "${source}"`, { stdio: 'inherit' });
        console.log(`✅ API-Spezifikation ist valide: ${source}`);
        return;
      } catch (error) {
        console.log(`❌ Fehler bei ${source}: ${error.message}`);
      }
    }
    
    throw new Error('Keine gültige API-Spezifikation gefunden');
    
  } catch (error) {
    console.error(`❌ API-Validierung fehlgeschlagen: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  validateApiSpec();
}

module.exports = { validateApiSpec };
```

### **4. Dependencies hinzufügen**
**Datei:** `keiko-frontend/package.json` (dependencies erweitern)

```json
{
  "devDependencies": {
    "node-fetch": "^3.3.2",
    "swagger-parser": "^10.0.3",
    "openapi-typescript": "^6.7.1",
    "nodemon": "^3.0.1"
  }
}
```

### **5. Environment-Konfiguration**
**Datei:** `keiko-frontend/.env.local`

```bash
# API-Contracts Service Configuration
VITE_API_CONTRACTS_SERVICE_URL=http://localhost:3001
VITE_API_CONTRACTS_TIMEOUT=30000

# Development Settings
VITE_DEV_MODE=true
VITE_API_MOCK_ENABLED=false
```

---

## 🧪 **TESTING**

### **Lokaler Test**
```bash
# Dependencies installieren
cd keiko-frontend
npm install

# API-Contracts Service starten (in anderem Terminal)
cd ../keiko-api-contracts
docker build -t keiko-api-contracts .
docker run -p 3001:3000 keiko-api-contracts

# API Types generieren
cd ../keiko-frontend
yarn generate:api

# Validierung
yarn validate:api

# Frontend starten
yarn dev
```

### **Integration Test**
```bash
# Mit Docker Compose
docker-compose -f docker-compose.dev-multi-repo.yml up keiko-api-contracts

# Frontend-Entwicklung
cd keiko-frontend
yarn pre-dev
yarn dev
```

---

## ✅ **ERFOLGSKRITERIEN**

1. **`yarn generate:api`** funktioniert ohne Fehler
2. **TypeScript-Types** werden in `src/types/api.ts` generiert
3. **API-Validierung** mit `yarn validate:api` erfolgreich
4. **Frontend startet** ohne OpenAPI-Fehler
5. **Fallback-Mechanismus** funktioniert wenn Service nicht verfügbar
6. **Hot-Reload** funktioniert bei API-Änderungen
7. **Error-Handling** ist robust und informativ

---

## 🔄 **NÄCHSTE SCHRITTE**

Nach Fertigstellung:
1. **CI/CD** anpassen für neue API-Generation
2. **Development-Workflow** dokumentieren
3. **Team** über neue Prozesse informieren

---

## 📝 **NOTIZEN**

- Script wartet automatisch auf API-Contracts Service
- Fallback auf lokale Dateien wenn Service nicht verfügbar
- Robuste Error-Handling und Retry-Logik
- Kompatibel mit Docker Compose und Kubernetes
- Automatische Validierung vor Type-Generierung
