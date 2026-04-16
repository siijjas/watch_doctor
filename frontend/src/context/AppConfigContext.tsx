import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isErpNext, apiFetchRaw } from '../services/apiService';

export interface AppConfig {
    logoUrl: string;
    currencyCode: string;
    currencySymbol: string;
    decimalPlaces: number;
}

const DEFAULT_CONFIG: AppConfig = {
    logoUrl: '',
    currencyCode: '',
    currencySymbol: '',
    decimalPlaces: 0,
};

interface AppConfigContextValue {
    config: AppConfig;
    refreshConfig: () => Promise<void>;
    formatCurrency: (amount: number) => string;
}

const AppConfigContext = createContext<AppConfigContextValue>({
    config: DEFAULT_CONFIG,
    refreshConfig: async () => {},
    formatCurrency: (n) => n.toLocaleString('en-US'),
});

export const useAppConfig = () => useContext(AppConfigContext);

export const AppConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

    const refreshConfig = useCallback(async () => {
        if (!isErpNext) return;
        try {
            const res = await apiFetchRaw('/api/method/watch_doctor.api.get_app_config', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            const data = res.message;
            if (data) {
                setConfig({
                    logoUrl: data.logo_url || '',
                    currencyCode: data.currency_code || '',
                    currencySymbol: data.currency_symbol || '',
                    decimalPlaces: typeof data.decimal_places === 'number' ? data.decimal_places : 0,
                });
            }
        } catch (e) {
            console.error('Failed to load app config:', e);
        }
    }, []);

    useEffect(() => {
        refreshConfig();
    }, [refreshConfig]);

    const formatCurrency = useCallback((amount: number): string => {
        return `${config.currencySymbol}${amount.toLocaleString('en-US', {
            minimumFractionDigits: config.decimalPlaces,
            maximumFractionDigits: config.decimalPlaces,
        })}`;
    }, [config]);

    return (
        <AppConfigContext.Provider value={{ config, refreshConfig, formatCurrency }}>
            {children}
        </AppConfigContext.Provider>
    );
};
