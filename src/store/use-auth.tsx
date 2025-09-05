import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useLocalStorage } from './use-local-storage';

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Development Token für lokale Entwicklung
const DEV_TOKEN = 'dev-token-12345';

export function AuthProvider({ children }: AuthProviderProps) {
  const { storedValue: storedToken, setValue: setStoredToken } = useLocalStorage<string | null>('auth_token', null);
  const [token, setToken] = useState<string | null>(storedToken);

  useEffect(() => {
    // In der Entwicklungsumgebung automatisch den Dev-Token setzen
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      if (!token) {
        setToken(DEV_TOKEN);
        setStoredToken(DEV_TOKEN);
      }
    }
  }, [token, setStoredToken]);

  const login = (newToken: string) => {
    setToken(newToken);
    setStoredToken(newToken);
  };

  const logout = () => {
    setToken(null);
    setStoredToken(null);
  };

  const getAuthHeaders = (): Record<string, string> => {
    if (!token) return {};
    return {
      'Authorization': `Bearer ${token}`,
    };
  };

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider value={{
      token,
      isAuthenticated,
      login,
      logout,
      getAuthHeaders,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
