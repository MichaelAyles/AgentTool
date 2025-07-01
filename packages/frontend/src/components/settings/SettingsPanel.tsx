import React, { useState, useEffect } from 'react';
import {
  Settings,
  User,
  Shield,
  Terminal,
  Palette,
  Bell,
  HardDrive,
  Network,
  Code,
  Monitor,
  Save,
  RotateCcw,
  Download,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

export interface UserSettings {
  profile: {
    username: string;
    email: string;
    displayName: string;
    avatar?: string;
  };
  security: {
    dangerousModeEnabled: boolean;
    sessionTimeout: number;
    requirePasswordConfirmation: boolean;
    auditLogging: boolean;
  };
  terminal: {
    fontSize: number;
    fontFamily: string;
    theme: 'dark' | 'light' | 'auto';
    cursorBlink: boolean;
    scrollback: number;
    bellSound: boolean;
    wordWrap: boolean;
  };
  appearance: {
    theme: 'light' | 'dark' | 'auto';
    accentColor: string;
    compactMode: boolean;
    showLineNumbers: boolean;
    animationsEnabled: boolean;
  };
  notifications: {
    enabled: boolean;
    email: boolean;
    desktop: boolean;
    sound: boolean;
    security: boolean;
    system: boolean;
    adapters: boolean;
  };
  performance: {
    autoSave: boolean;
    maxSessions: number;
    memoryLimit: number;
    diskCacheSize: number;
    networkTimeout: number;
  };
  development: {
    debugMode: boolean;
    verboseLogging: boolean;
    showPerformanceMetrics: boolean;
    autoReload: boolean;
    experimentalFeatures: boolean;
  };
}

export interface SettingsPanelProps {
  settings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
  onSave: () => void;
  onReset: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  loading?: boolean;
  hasUnsavedChanges?: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSettingsChange,
  onSave,
  onReset,
  onExport,
  onImport,
  loading = false,
  hasUnsavedChanges = false,
}) => {
  const [activeSection, setActiveSection] = useState<string>('profile');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['profile']));
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const sections = [
    { id: 'profile', label: 'Profile', icon: User, description: 'Personal information and account settings' },
    { id: 'security', label: 'Security', icon: Shield, description: 'Security and privacy settings' },
    { id: 'terminal', label: 'Terminal', icon: Terminal, description: 'Terminal appearance and behavior' },
    { id: 'appearance', label: 'Appearance', icon: Palette, description: 'UI theme and visual preferences' },
    { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Notification preferences' },
    { id: 'performance', label: 'Performance', icon: HardDrive, description: 'Performance and resource settings' },
    { id: 'development', label: 'Development', icon: Code, description: 'Developer tools and debugging', advanced: true },
  ];

  const visibleSections = sections.filter(section => 
    !section.advanced || showAdvanced
  );

  const filteredSections = visibleSections.filter(section => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      section.label.toLowerCase().includes(query) ||
      section.description.toLowerCase().includes(query)
    );
  });

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const updateSettings = (section: keyof UserSettings, field: string, value: any) => {
    onSettingsChange({
      ...settings,
      [section]: {
        ...settings[section],
        [field]: value,
      },
    });
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
    }
    // Reset input
    event.target.value = '';
  };

  const renderFormField = (
    label: string,
    value: any,
    onChange: (value: any) => void,
    type: 'text' | 'number' | 'boolean' | 'select' | 'color' = 'text',
    options?: Array<{ value: any; label: string }>,
    description?: string,
    min?: number,
    max?: number,
    step?: number
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-900 dark:text-white">
          {label}
        </label>
        {type === 'boolean' && (
          <button
            onClick={() => onChange(!value)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              value ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                value ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        )}
      </div>
      
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      )}
      
      {type === 'text' && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
      )}
      
      {type === 'number' && (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
      )}
      
      {type === 'select' && options && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      
      {type === 'color' && (
        <div className="flex items-center space-x-2">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-12 h-8 border border-gray-300 dark:border-gray-600 rounded cursor-pointer"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
          />
        </div>
      )}
    </div>
  );

  const renderSectionContent = (sectionId: string) => {
    switch (sectionId) {
      case 'profile':
        return (
          <div className="space-y-4">
            {renderFormField(
              'Username',
              settings.profile.username,
              (value) => updateSettings('profile', 'username', value),
              'text',
              undefined,
              'Your unique username'
            )}
            {renderFormField(
              'Display Name',
              settings.profile.displayName,
              (value) => updateSettings('profile', 'displayName', value),
              'text',
              undefined,
              'Name shown to other users'
            )}
            {renderFormField(
              'Email',
              settings.profile.email,
              (value) => updateSettings('profile', 'email', value),
              'text',
              undefined,
              'Your email address for notifications'
            )}
          </div>
        );

      case 'security':
        return (
          <div className="space-y-4">
            {renderFormField(
              'Dangerous Mode',
              settings.security.dangerousModeEnabled,
              (value) => updateSettings('security', 'dangerousModeEnabled', value),
              'boolean',
              undefined,
              'Allow execution of potentially dangerous commands'
            )}
            {renderFormField(
              'Session Timeout (minutes)',
              settings.security.sessionTimeout,
              (value) => updateSettings('security', 'sessionTimeout', value),
              'number',
              undefined,
              'Automatically log out after inactivity',
              5,
              1440,
              5
            )}
            {renderFormField(
              'Require Password Confirmation',
              settings.security.requirePasswordConfirmation,
              (value) => updateSettings('security', 'requirePasswordConfirmation', value),
              'boolean',
              undefined,
              'Require password for sensitive operations'
            )}
            {renderFormField(
              'Audit Logging',
              settings.security.auditLogging,
              (value) => updateSettings('security', 'auditLogging', value),
              'boolean',
              undefined,
              'Log security-relevant actions'
            )}
          </div>
        );

      case 'terminal':
        return (
          <div className="space-y-4">
            {renderFormField(
              'Font Size',
              settings.terminal.fontSize,
              (value) => updateSettings('terminal', 'fontSize', value),
              'number',
              undefined,
              'Terminal font size in pixels',
              10,
              24,
              1
            )}
            {renderFormField(
              'Font Family',
              settings.terminal.fontFamily,
              (value) => updateSettings('terminal', 'fontFamily', value),
              'select',
              [
                { value: 'Monaco, "Cascadia Code", "SF Mono", Consolas, monospace', label: 'Monaco (Default)' },
                { value: '"JetBrains Mono", Monaco, Consolas, monospace', label: 'JetBrains Mono' },
                { value: '"Fira Code", Monaco, Consolas, monospace', label: 'Fira Code' },
                { value: 'Consolas, Monaco, "Courier New", monospace', label: 'Consolas' },
                { value: '"Source Code Pro", Monaco, Consolas, monospace', label: 'Source Code Pro' },
              ],
              'Monospace font for terminal'
            )}
            {renderFormField(
              'Theme',
              settings.terminal.theme,
              (value) => updateSettings('terminal', 'theme', value),
              'select',
              [
                { value: 'auto', label: 'Auto (Follow system)' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ],
              'Terminal color theme'
            )}
            {renderFormField(
              'Cursor Blink',
              settings.terminal.cursorBlink,
              (value) => updateSettings('terminal', 'cursorBlink', value),
              'boolean',
              undefined,
              'Make terminal cursor blink'
            )}
            {renderFormField(
              'Scrollback Lines',
              settings.terminal.scrollback,
              (value) => updateSettings('terminal', 'scrollback', value),
              'number',
              undefined,
              'Number of lines to keep in scroll history',
              100,
              10000,
              100
            )}
            {renderFormField(
              'Bell Sound',
              settings.terminal.bellSound,
              (value) => updateSettings('terminal', 'bellSound', value),
              'boolean',
              undefined,
              'Play sound on terminal bell'
            )}
            {renderFormField(
              'Word Wrap',
              settings.terminal.wordWrap,
              (value) => updateSettings('terminal', 'wordWrap', value),
              'boolean',
              undefined,
              'Wrap long lines in terminal'
            )}
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-4">
            {renderFormField(
              'UI Theme',
              settings.appearance.theme,
              (value) => updateSettings('appearance', 'theme', value),
              'select',
              [
                { value: 'auto', label: 'Auto (Follow system)' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ],
              'Overall application theme'
            )}
            {renderFormField(
              'Accent Color',
              settings.appearance.accentColor,
              (value) => updateSettings('appearance', 'accentColor', value),
              'color',
              undefined,
              'Primary accent color for the interface'
            )}
            {renderFormField(
              'Compact Mode',
              settings.appearance.compactMode,
              (value) => updateSettings('appearance', 'compactMode', value),
              'boolean',
              undefined,
              'Reduce spacing for more content on screen'
            )}
            {renderFormField(
              'Show Line Numbers',
              settings.appearance.showLineNumbers,
              (value) => updateSettings('appearance', 'showLineNumbers', value),
              'boolean',
              undefined,
              'Show line numbers in code editors'
            )}
            {renderFormField(
              'Animations',
              settings.appearance.animationsEnabled,
              (value) => updateSettings('appearance', 'animationsEnabled', value),
              'boolean',
              undefined,
              'Enable UI animations and transitions'
            )}
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-4">
            {renderFormField(
              'Notifications Enabled',
              settings.notifications.enabled,
              (value) => updateSettings('notifications', 'enabled', value),
              'boolean',
              undefined,
              'Enable all notifications'
            )}
            {renderFormField(
              'Email Notifications',
              settings.notifications.email,
              (value) => updateSettings('notifications', 'email', value),
              'boolean',
              undefined,
              'Send notifications via email'
            )}
            {renderFormField(
              'Desktop Notifications',
              settings.notifications.desktop,
              (value) => updateSettings('notifications', 'desktop', value),
              'boolean',
              undefined,
              'Show browser/desktop notifications'
            )}
            {renderFormField(
              'Sound Notifications',
              settings.notifications.sound,
              (value) => updateSettings('notifications', 'sound', value),
              'boolean',
              undefined,
              'Play sound for notifications'
            )}
            {renderFormField(
              'Security Alerts',
              settings.notifications.security,
              (value) => updateSettings('notifications', 'security', value),
              'boolean',
              undefined,
              'Notify about security events'
            )}
            {renderFormField(
              'System Events',
              settings.notifications.system,
              (value) => updateSettings('notifications', 'system', value),
              'boolean',
              undefined,
              'Notify about system status changes'
            )}
            {renderFormField(
              'Adapter Events',
              settings.notifications.adapters,
              (value) => updateSettings('notifications', 'adapters', value),
              'boolean',
              undefined,
              'Notify about adapter status changes'
            )}
          </div>
        );

      case 'performance':
        return (
          <div className="space-y-4">
            {renderFormField(
              'Auto Save',
              settings.performance.autoSave,
              (value) => updateSettings('performance', 'autoSave', value),
              'boolean',
              undefined,
              'Automatically save changes'
            )}
            {renderFormField(
              'Max Concurrent Sessions',
              settings.performance.maxSessions,
              (value) => updateSettings('performance', 'maxSessions', value),
              'number',
              undefined,
              'Maximum number of concurrent terminal sessions',
              1,
              20,
              1
            )}
            {renderFormField(
              'Memory Limit (MB)',
              settings.performance.memoryLimit,
              (value) => updateSettings('performance', 'memoryLimit', value),
              'number',
              undefined,
              'Maximum memory usage per session',
              100,
              4096,
              100
            )}
            {renderFormField(
              'Disk Cache Size (MB)',
              settings.performance.diskCacheSize,
              (value) => updateSettings('performance', 'diskCacheSize', value),
              'number',
              undefined,
              'Maximum disk cache size',
              50,
              1024,
              50
            )}
            {renderFormField(
              'Network Timeout (seconds)',
              settings.performance.networkTimeout,
              (value) => updateSettings('performance', 'networkTimeout', value),
              'number',
              undefined,
              'Timeout for network requests',
              5,
              60,
              5
            )}
          </div>
        );

      case 'development':
        return (
          <div className="space-y-4">
            {renderFormField(
              'Debug Mode',
              settings.development.debugMode,
              (value) => updateSettings('development', 'debugMode', value),
              'boolean',
              undefined,
              'Enable debug logging and tools'
            )}
            {renderFormField(
              'Verbose Logging',
              settings.development.verboseLogging,
              (value) => updateSettings('development', 'verboseLogging', value),
              'boolean',
              undefined,
              'Show detailed logs in console'
            )}
            {renderFormField(
              'Performance Metrics',
              settings.development.showPerformanceMetrics,
              (value) => updateSettings('development', 'showPerformanceMetrics', value),
              'boolean',
              undefined,
              'Display performance metrics in UI'
            )}
            {renderFormField(
              'Auto Reload',
              settings.development.autoReload,
              (value) => updateSettings('development', 'autoReload', value),
              'boolean',
              undefined,
              'Automatically reload on code changes'
            )}
            {renderFormField(
              'Experimental Features',
              settings.development.experimentalFeatures,
              (value) => updateSettings('development', 'experimentalFeatures', value),
              'boolean',
              undefined,
              'Enable experimental and beta features'
            )}
          </div>
        );

      default:
        return (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Select a settings category to configure
          </div>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Settings className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h2>
            {hasUnsavedChanges && (
              <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-xs rounded-full font-medium">
                Unsaved changes
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-sm ${
                showAdvanced
                  ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              title={showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
            >
              {showAdvanced ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>Advanced</span>
            </button>
            
            <input
              type="file"
              id="import-settings"
              accept=".json"
              onChange={handleFileImport}
              className="hidden"
            />
            <button
              onClick={() => document.getElementById('import-settings')?.click()}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Import settings"
            >
              <Upload className="w-4 h-4" />
            </button>
            
            <button
              onClick={onExport}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Export settings"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4">
          <input
            type="text"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex h-96">
        {/* Settings Navigation */}
        <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-4">
            {filteredSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              const isExpanded = expandedSections.has(section.id);
              
              return (
                <div key={section.id} className="mb-2">
                  <button
                    onClick={() => {
                      setActiveSection(section.id);
                      toggleSection(section.id);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="w-5 h-5" />
                      <div>
                        <div className="font-medium">{section.label}</div>
                        <div className="text-xs opacity-75">{section.description}</div>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Settings Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {renderSectionContent(activeSection)}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={onReset}
              className="flex items-center space-x-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset to Defaults</span>
            </button>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={onSave}
              disabled={loading || !hasUnsavedChanges}
              className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;