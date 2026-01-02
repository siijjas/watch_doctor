import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as authService from '../services/authService';
import type { UserSession } from '../services/authService';

interface AuthContextType {
    user: UserSession | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<UserSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Bootstrap: Check for existing session on mount
    useEffect(() => {
        const bootstrap = async () => {
            try {
                const session = await authService.getSession();
                setUser(session);
            } catch (_e) {
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };
        bootstrap();
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        const session = await authService.login(username, password);
        setUser(session);
    }, []);

    const logout = useCallback(async () => {
        try {
            await authService.logout();
        } catch (e) {
            console.error('Logout error:', e);
        } finally {
            setUser(null);
        }
    }, []);

    const value: AuthContextType = {
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
