import { useCallback } from 'react';
import { useSettings as useSettingsStore, useSettingsActions } from '../store';

export function useSettings() {
  const settings = useSettingsStore();
  const { updateSettings, updateTerminalSettings, toggleDangerousMode } =
    useSettingsActions();

  const updateSetting = useCallback(
    (key: keyof typeof settings, value: any) => {
      updateSettings({ [key]: value });
    },
    [updateSettings]
  );

  const updateTerminalSetting = useCallback(
    (key: keyof typeof settings.terminalSettings, value: any) => {
      updateTerminalSettings({ [key]: value });
    },
    [updateTerminalSettings]
  );

  const getDangerousModeStatus = useCallback(() => {
    return {
      enabled: settings.dangerousMode,
      warning: settings.dangerousMode
        ? 'Dangerous mode is enabled. Commands will run without safety checks.'
        : 'Dangerous mode is disabled. Commands are filtered for safety.',
    };
  }, [settings.dangerousMode]);

  const getTerminalThemeVariables = useCallback(() => {
    const { terminalSettings } = settings;
    return {
      '--terminal-font-size': `${terminalSettings.fontSize}px`,
      '--terminal-font-family': terminalSettings.fontFamily,
    };
  }, [settings.terminalSettings]);

  return {
    settings,
    updateSetting,
    updateTerminalSetting,
    toggleDangerousMode,
    getDangerousModeStatus,
    getTerminalThemeVariables,

    // Convenience methods
    isDangerousMode: settings.dangerousMode,
    isAutoSaveEnabled: settings.autoSave,
    defaultAdapter: settings.defaultAdapter,
    terminalSettings: settings.terminalSettings,
  };
}

// Hook for dangerous mode confirmation
export function useDangerousMode() {
  const { isDangerousMode } = useSettings();
  const { toggleDangerousMode } = useSettingsActions();

  const executeWithConfirmation = useCallback(
    async (
      action: () => Promise<void> | void,
      options?: {
        title?: string;
        message?: string;
        skipConfirmation?: boolean;
      }
    ) => {
      const {
        title = 'Dangerous Operation',
        message = 'This operation may be dangerous. Are you sure you want to continue?',
        skipConfirmation = false,
      } = options || {};

      if (!isDangerousMode && !skipConfirmation) {
        const confirmed = window.confirm(`${title}\n\n${message}`);
        if (!confirmed) {
          return;
        }
      }

      await action();
    },
    [isDangerousMode]
  );

  return {
    isDangerousMode,
    toggleDangerousMode,
    executeWithConfirmation,
  };
}
