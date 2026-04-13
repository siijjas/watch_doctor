import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as authService from '../services/authService';
import type { UserSession } from '../services/authService';
import { getUserInfo } from '../services/apiService';
import { isErpNext } from '../services/apiService';
import type { DWRole, UserInfo } from '../types';

interface AuthContextType {
    user: UserSession | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    roles: DWRole[];
    userInfo: UserInfo | null;
    hasRole: (...allowed: DWRole[]) => boolean;
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
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const roles: DWRole[] = userInfo?.roles ?? [];

    const hasRole = useCallback((...allowed: DWRole[]) => {
        return allowed.some(r => roles.includes(r));
    }, [roles]);

    const fetchUserInfo = useCallback(async () => {
        if (!isErpNext) return;
        try {
            const info = await getUserInfo();
            setUserInfo(info);
        } catch (_e) {
            // If the endpoint fails (e.g. old backend), treat as executive for
            // backward compatibility during upgrades.
            setUserInfo(null);
        }
    }, []);

    // Bootstrap: Check for existing session on mount
    useEffect(() => {
        const bootstrap = async () => {
            try {
                const session = await authService.getSession();
                setUser(session);
                await fetchUserInfo();
            } catch (_e) {
                setUser(null);
                setUserInfo(null);
            } finally {
                setIsLoading(false);
            }
        };
        bootstrap();
    }, [fetchUserInfo]);

    const login = useCallback(async (username: string, password: string) => {
        const session = await authService.login(username, password);
        setUser(session);
        await fetchUserInfo();
    }, [fetchUserInfo]);

    const logout = useCallback(async () => {
        try {
            await authService.logout();
        } catch (e) {
            console.error('Logout error:', e);
        } finally {
            setUser(null);
            setUserInfo(null);
        }
    }, []);

    const value: AuthContextType = {
        user,
        isAuthenticated: !!user,
        isLoading,
        roles,
        userInfo,
        hasRole,
        login,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
