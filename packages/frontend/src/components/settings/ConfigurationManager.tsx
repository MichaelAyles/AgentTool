import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Server,
  Key,
  Globe,
  Shield,
  Zap,
  HardDrive,
  Network,
  Monitor,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Save,
  Upload,
  Download,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Edit3,
} from 'lucide-react';

export interface ConfigurationValue {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  category: string;
  description?: string;
  sensitive?: boolean;
  required?: boolean;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
}

export interface ConfigurationCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  values: ConfigurationValue[];
}

export interface ConfigurationManagerProps {
  configurations: ConfigurationCategory[];
  onSave: (categoryId: string, values: Record<string, any>) => Promise<void>;
  onReset: (categoryId: string) => Promise<void>;
  onValidate: (
    categoryId: string,
    values: Record<string, any>
  ) => Promise<{ valid: boolean; errors: string[] }>;
  onExport: (categoryId?: string) => void;
  onImport: (file: File, categoryId?: string) => Promise<void>;
  loading?: boolean;
  readonly?: boolean;
}

const ConfigurationManager: React.FC<ConfigurationManagerProps> = ({
  configurations,
  onSave,
  onReset,
  onValidate,
  onExport,
  onImport,
  loading = false,
  readonly = false,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>(
    configurations[0]?.id || ''
  );
  const [values, setValues] = useState<Record<string, Record<string, any>>>({});
  const [modifiedValues, setModifiedValues] = useState<
    Record<string, Set<string>>
  >({});
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string[]>
  >({});
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>(
    {}
  );
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(
    new Set()
  );

  // Initialize values from configurations
  useEffect(() => {
    const initialValues: Record<string, Record<string, any>> = {};
    configurations.forEach(category => {
      initialValues[category.id] = {};
      category.values.forEach(config => {
        initialValues[category.id][config.key] = config.value;
      });
    });
    setValues(initialValues);
  }, [configurations]);

  const updateValue = (categoryId: string, key: string, newValue: any) => {
    if (readonly) return;

    setValues(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        [key]: newValue,
      },
    }));

    setModifiedValues(prev => ({
      ...prev,
      [categoryId]: new Set([...(prev[categoryId] || []), key]),
    }));

    // Clear validation errors for this field
    setValidationErrors(prev => ({
      ...prev,
      [categoryId]:
        prev[categoryId]?.filter(error => !error.includes(key)) || [],
    }));
  };

  const validateAndSave = async (categoryId: string) => {
    if (readonly) return;

    try {
      const categoryValues = values[categoryId] || {};
      const validation = await onValidate(categoryId, categoryValues);

      if (validation.valid) {
        await onSave(categoryId, categoryValues);
        setModifiedValues(prev => ({
          ...prev,
          [categoryId]: new Set(),
        }));
        setValidationErrors(prev => ({
          ...prev,
          [categoryId]: [],
        }));
      } else {
        setValidationErrors(prev => ({
          ...prev,
          [categoryId]: validation.errors,
        }));
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setValidationErrors(prev => ({
        ...prev,
        [categoryId]: [
          `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      }));
    }
  };

  const resetCategory = async (categoryId: string) => {
    if (readonly) return;

    try {
      await onReset(categoryId);
      const category = configurations.find(c => c.id === categoryId);
      if (category) {
        const resetValues: Record<string, any> = {};
        category.values.forEach(config => {
          resetValues[config.key] =
            config.defaultValue !== undefined
              ? config.defaultValue
              : config.value;
        });
        setValues(prev => ({
          ...prev,
          [categoryId]: resetValues,
        }));
        setModifiedValues(prev => ({
          ...prev,
          [categoryId]: new Set(),
        }));
        setValidationErrors(prev => ({
          ...prev,
          [categoryId]: [],
        }));
      }
    } catch (error) {
      console.error('Failed to reset configuration:', error);
    }
  };

  const handleFileImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file && !readonly) {
      try {
        await onImport(file, activeCategory);
      } catch (error) {
        console.error('Failed to import configuration:', error);
      }
    }
    event.target.value = '';
  };

  const toggleSensitive = (key: string) => {
    setShowSensitive(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleObjectExpansion = (key: string) => {
    const newExpanded = new Set(expandedObjects);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedObjects(newExpanded);
  };

  const renderValue = (categoryId: string, config: ConfigurationValue) => {
    const currentValue = values[categoryId]?.[config.key] ?? config.value;
    const isModified = modifiedValues[categoryId]?.has(config.key) || false;
    const isSensitive = config.sensitive && !showSensitive[config.key];

    if (config.type === 'boolean') {
      return (
        <button
          onClick={() => updateValue(categoryId, config.key, !currentValue)}
          disabled={readonly}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            currentValue ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
          } ${readonly ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              currentValue ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      );
    }

    if (config.type === 'object' || config.type === 'array') {
      const isExpanded = expandedObjects.has(config.key);
      return (
        <div className='space-y-2'>
          <div className='flex items-center space-x-2'>
            <button
              onClick={() => toggleObjectExpansion(config.key)}
              className='text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            >
              {isExpanded ? '▼' : '▶'}
            </button>
            <span className='text-sm text-gray-600 dark:text-gray-400'>
              {config.type === 'array'
                ? `Array (${Array.isArray(currentValue) ? currentValue.length : 0} items)`
                : 'Object'}
            </span>
          </div>
          {isExpanded && (
            <pre className='bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-sm overflow-x-auto'>
              {JSON.stringify(currentValue, null, 2)}
            </pre>
          )}
        </div>
      );
    }

    const inputClass = `w-full px-3 py-2 border rounded-lg text-sm transition-colors ${
      isModified
        ? 'border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/20'
        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
    } ${readonly ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''} text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent`;

    if (config.validation?.enum) {
      return (
        <select
          value={currentValue}
          onChange={e => updateValue(categoryId, config.key, e.target.value)}
          disabled={readonly}
          className={inputClass}
        >
          {config.validation.enum.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (config.type === 'number') {
      return (
        <input
          type='number'
          value={currentValue}
          onChange={e =>
            updateValue(categoryId, config.key, Number(e.target.value))
          }
          disabled={readonly}
          min={config.validation?.min}
          max={config.validation?.max}
          className={inputClass}
        />
      );
    }

    return (
      <div className='relative'>
        <input
          type={isSensitive ? 'password' : 'text'}
          value={isSensitive ? '••••••••' : currentValue}
          onChange={e => updateValue(categoryId, config.key, e.target.value)}
          disabled={readonly || isSensitive}
          className={inputClass}
        />
        {config.sensitive && (
          <button
            onClick={() => toggleSensitive(config.key)}
            className='absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
          >
            {isSensitive ? (
              <Eye className='w-4 h-4' />
            ) : (
              <EyeOff className='w-4 h-4' />
            )}
          </button>
        )}
      </div>
    );
  };

  const activeConfig = configurations.find(c => c.id === activeCategory);
  const hasModifications = modifiedValues[activeCategory]?.size > 0;
  const hasErrors = validationErrors[activeCategory]?.length > 0;

  return (
    <div className='bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden'>
      {/* Header */}
      <div className='bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center space-x-3'>
            <Settings className='w-6 h-6 text-gray-600 dark:text-gray-400' />
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
              Configuration Manager
            </h2>
            {readonly && (
              <span className='px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-full font-medium'>
                Read Only
              </span>
            )}
          </div>

          <div className='flex items-center space-x-2'>
            <input
              type='file'
              id='import-config'
              accept='.json'
              onChange={handleFileImport}
              className='hidden'
            />
            {!readonly && (
              <button
                onClick={() =>
                  document.getElementById('import-config')?.click()
                }
                className='p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg'
                title='Import configuration'
              >
                <Upload className='w-4 h-4' />
              </button>
            )}

            <button
              onClick={() => onExport(activeCategory)}
              className='p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg'
              title='Export configuration'
            >
              <Download className='w-4 h-4' />
            </button>
          </div>
        </div>
      </div>

      <div className='flex h-96'>
        {/* Categories Sidebar */}
        <div className='w-1/3 border-r border-gray-200 dark:border-gray-700 overflow-y-auto'>
          <div className='p-4'>
            {configurations.map(category => {
              const Icon = category.icon;
              const isActive = activeCategory === category.id;
              const categoryHasModifications =
                modifiedValues[category.id]?.size > 0;
              const categoryHasErrors =
                validationErrors[category.id]?.length > 0;

              return (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`w-full flex items-center space-x-3 p-3 rounded-lg text-left transition-colors mb-2 ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon className='w-5 h-5 flex-shrink-0' />
                  <div className='flex-1 min-w-0'>
                    <div className='font-medium'>{category.name}</div>
                    <div className='text-xs opacity-75 truncate'>
                      {category.description}
                    </div>
                  </div>
                  <div className='flex flex-col items-center space-y-1'>
                    {categoryHasErrors && (
                      <XCircle className='w-4 h-4 text-red-500' />
                    )}
                    {categoryHasModifications && !categoryHasErrors && (
                      <AlertTriangle className='w-4 h-4 text-orange-500' />
                    )}
                    {!categoryHasModifications && !categoryHasErrors && (
                      <CheckCircle className='w-4 h-4 text-green-500' />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Configuration Content */}
        <div className='flex-1 flex flex-col'>
          {activeConfig && (
            <>
              {/* Category Header */}
              <div className='border-b border-gray-200 dark:border-gray-700 p-6'>
                <div className='flex items-center space-x-3 mb-2'>
                  <activeConfig.icon className='w-6 h-6 text-gray-600 dark:text-gray-400' />
                  <h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
                    {activeConfig.name}
                  </h3>
                </div>
                <p className='text-sm text-gray-600 dark:text-gray-400'>
                  {activeConfig.description}
                </p>

                {/* Status and Actions */}
                <div className='flex items-center justify-between mt-4'>
                  <div className='flex items-center space-x-4 text-sm'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {activeConfig.values.length} configuration
                      {activeConfig.values.length !== 1 ? 's' : ''}
                    </span>
                    {hasModifications && (
                      <span className='text-orange-600 dark:text-orange-400'>
                        {modifiedValues[activeCategory]?.size} unsaved change
                        {modifiedValues[activeCategory]?.size !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {!readonly && (
                    <div className='flex items-center space-x-2'>
                      <button
                        onClick={() => resetCategory(activeCategory)}
                        className='px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded'
                      >
                        Reset
                      </button>
                      <button
                        onClick={() => validateAndSave(activeCategory)}
                        disabled={!hasModifications || loading}
                        className='px-4 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
                      >
                        {loading ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Validation Errors */}
              {hasErrors && (
                <div className='bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 p-4'>
                  <div className='flex items-center space-x-2 mb-2'>
                    <XCircle className='w-5 h-5 text-red-600 dark:text-red-400' />
                    <h4 className='font-medium text-red-800 dark:text-red-200'>
                      Validation Errors
                    </h4>
                  </div>
                  <ul className='text-sm text-red-700 dark:text-red-300 space-y-1'>
                    {validationErrors[activeCategory]?.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Configuration Values */}
              <div className='flex-1 overflow-y-auto p-6'>
                <div className='space-y-6'>
                  {activeConfig.values.map(config => (
                    <div key={config.key} className='space-y-2'>
                      <div className='flex items-center justify-between'>
                        <div className='flex items-center space-x-2'>
                          <label className='text-sm font-medium text-gray-900 dark:text-white'>
                            {config.key}
                          </label>
                          {config.required && (
                            <span className='text-red-500 text-xs'>*</span>
                          )}
                          {config.sensitive && (
                            <div title='Sensitive value'>
                              <Key className='w-3 h-3 text-orange-500' />
                            </div>
                          )}
                          {modifiedValues[activeCategory]?.has(config.key) && (
                            <span className='px-1 py-0.5 bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-xs rounded'>
                              Modified
                            </span>
                          )}
                        </div>
                        <span className='text-xs text-gray-500 dark:text-gray-400 capitalize'>
                          {config.type}
                        </span>
                      </div>

                      {config.description && (
                        <p className='text-xs text-gray-500 dark:text-gray-400'>
                          {config.description}
                        </p>
                      )}

                      {renderValue(activeCategory, config)}

                      {config.validation && (
                        <div className='text-xs text-gray-500 dark:text-gray-400'>
                          {config.validation.min !== undefined &&
                            config.validation.max !== undefined && (
                              <span>
                                Range: {config.validation.min} -{' '}
                                {config.validation.max}
                              </span>
                            )}
                          {config.validation.pattern && (
                            <span>Pattern: {config.validation.pattern}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfigurationManager;
