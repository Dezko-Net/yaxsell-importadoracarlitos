'use client';

import React, { useState, useEffect, useCallback, useMemo, createContext, useContext, ReactNode } from 'react';
import { User } from '@/services/authService';
import { AuthService } from '@/services/authService';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string; isNewUser?: boolean }>;
  register: (email: string, password: string, name: string, phone?: string, rut?: string, birthDate?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
  updateProfile: (updates: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuthStatus = useCallback(async () => {
    try {
      const currentUser = await AuthService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Verificar estado de autenticación al cargar y sincronizar renovaciones de token de Firebase
  useEffect(() => {
    checkAuthStatus();
    const unsub = AuthService.onAuthChange((fbUser) => {
      if (fbUser) {
        setUser((prev) => {
          const merged = prev && prev.id === fbUser.id
            ? { ...prev, ...fbUser, name: fbUser.name !== 'Usuario' ? fbUser.name : prev.name, photoURL: fbUser.photoURL || prev.photoURL }
            : fbUser;
          try {
            localStorage.setItem('yaxsel_auth_user', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      } else {
        setUser(null);
      }
    });
    return () => unsub();
  }, [checkAuthStatus]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const result = await AuthService.login(email, password);
      if (result.success && result.user) {
        setUser(result.user);
      }
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error al iniciar sesión'
      };
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    try {
      const result = await AuthService.loginWithGoogle();
      if (result.success && result.user) {
        setUser(result.user);
      }
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error al iniciar sesi\u00F3n con Google'
      };
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name: string, phone?: string, rut?: string, birthDate?: string) => {
    try {
      const result = await AuthService.register(email, password, name, phone, rut, birthDate);
      if (result.success && result.user) {
        setUser(result.user);
      }
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error al registrarse'
      };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const result = await AuthService.logout();
      if (result.success) {
        setUser(null);
      }
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error al cerrar sesión'
      };
    }
  }, []);

  const updateProfile = useCallback(async (updates: Partial<User>) => {
    try {
      const result = await AuthService.updateProfile(updates);
      if (result.success && result.user) {
        setUser(result.user);
      }
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error al actualizar perfil'
      };
    }
  }, []);

  const refreshUser = useCallback(async () => {
    await checkAuthStatus();
  }, [checkAuthStatus]);

  // 🔒 CRÍTICO: Estabilizar el objeto value con useMemo para evitar
  // re-renders en cascada en NotificationContext, FavoritesContext, etc.
  // Sin esto, el value se recrea en cada render y dispara loops infinitos.
  const value = useMemo<AuthContextType>(() => ({
    user,
    isLoading,
    isLoggedIn: !!user,
    login,
    loginWithGoogle,
    register,
    logout,
    updateProfile,
    refreshUser,
  }), [user, isLoading, login, loginWithGoogle, register, logout, updateProfile, refreshUser]);

  return React.createElement(
    AuthContext.Provider,
    { value },
    children
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
