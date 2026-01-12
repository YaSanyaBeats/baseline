'use client';

import { createContext, useContext, useState, Dispatch, SetStateAction, ReactNode } from 'react';

type SnackbarState = {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
};

type SnackbarContextType = {
  snackbar: SnackbarState;
  setSnackbar: Dispatch<SetStateAction<SnackbarState>>;
};

type SnackbarProviderProps = {
  children: ReactNode;
  defaultState: SnackbarState;
};

export const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);

export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
}

export function SnackbarProvider({ children, defaultState }: SnackbarProviderProps) {
  const [snackbar, setSnackbar] = useState(defaultState);

  return (
    <SnackbarContext.Provider value={{ snackbar, setSnackbar }}>
      {children}
    </SnackbarContext.Provider>
  );
}
