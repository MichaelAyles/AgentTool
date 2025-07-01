import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// Configuration schema validation
export interface AdapterConfigSchema {
  name: string;
  version: string;
  description?: string;
  properties: Record<string, ConfigProperty>;
  required?: string[];
  dependencies?: Record<string, ConfigDependency>;
  validation?: ConfigValidation;
  metadata?: Record<string, any>;
}

export interface ConfigProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'select' | 'file' | 'directory';
  description?: string;
  default?: any;
  required?: boolean;
  min?: number;
  max?: number;
  options?: string[]; // For select type
  pattern?: string; // For string validation
  format?: 'url' | 'email' | 'path' | 'json';
  sensitive?: boolean; // For secure values
  validation?: string; // Custom validation expression
  condition?: string; // Show/hide based on other values
  group?: string; // UI grouping
}

export interface ConfigDependency {
  condition: string;
  properties: string[];
  message?: string;
}

export interface ConfigValidation {
  custom?: string[]; // Custom validation function names
  rules?: ConfigValidationRule[];
}

export interface ConfigValidationRule {
  condition: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

// Configuration instances
export interface AdapterConfiguration {
  id: string;
  adapterId: string;
  adapterVersion: string;
  name: string;
  description?: string;
  isActive: boolean;
  isDefault?: boolean;
  configuration: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  environment?: 'development' | 'staging' | 'production';
  tags?: string[];
  metadata?: Record<string, any>;
}

// Configuration templates
export interface ConfigurationTemplate {
  id: string;
  name: string;
  description?: string;
  adapterId: string;
  configuration: Record<string, any>;
  isPublic: boolean;
  createdAt: Date;
  createdBy: string;
  usageCount: number;
  tags?: string[];
}

// Configuration history and versioning
export interface ConfigurationHistory {
  configurationId: string;
  version: number;
  configuration: Record<string, any>;
  changedBy: string;
  changedAt: Date;
  changeReason?: string;
  previousVersion?: number;
}

// Configuration events
export interface ConfigurationEvent {
  type: 'created' | 'updated' | 'deleted' | 'activated' | 'deactivated' | 'validated' | 'deployed';
  configurationId: string;
  adapterId: string;
  userId: string;
  timestamp: Date;
  details: Record<string, any>;
}

export class AdapterConfigurationManager extends EventEmitter {
  private static instance: AdapterConfigurationManager;
  private schemas: Map<string, AdapterConfigSchema> = new Map();
  private configurations: Map<string, AdapterConfiguration> = new Map();
  private templates: Map<string, ConfigurationTemplate> = new Map();
  private history: Map<string, ConfigurationHistory[]> = new Map();
  private activeConfigs: Map<string, string> = new Map(); // adapterId -> configId
  private configDir: string;
  private initialized = false;

  constructor() {
    super();
    this.configDir = join(process.cwd(), '.config', 'adapters');
    this.ensureConfigDirectory();
  }

  static getInstance(): AdapterConfigurationManager {
    if (!AdapterConfigurationManager.instance) {
      AdapterConfigurationManager.instance = new AdapterConfigurationManager();
    }
    return AdapterConfigurationManager.instance;
  }

  /**
   * Initialize the configuration manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadSchemas();
      await this.loadConfigurations();
      await this.loadTemplates();
      await this.loadHistory();
      
      this.initialized = true;
      this.emit('initialized');
      
      console.log('✅ Adapter configuration manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize adapter configuration manager:', error);
      throw error;
    }
  }

  /**
   * Register a configuration schema for an adapter
   */
  async registerSchema(adapterId: string, schema: AdapterConfigSchema): Promise<void> {
    try {
      // Validate schema
      this.validateSchema(schema);
      
      // Store schema
      this.schemas.set(adapterId, schema);
      
      // Persist to file
      await this.saveSchema(adapterId, schema);
      
      this.emit('schemaRegistered', { adapterId, schema });
      
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapter_schema_registered',
        resourceType: 'adapter_schema',
        resourceId: adapterId,
        userId: 'system',
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          adapterId,
          schemaVersion: schema.version,
          propertiesCount: Object.keys(schema.properties).length,
        },
      });
    } catch (error) {
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'adapter_schema_registration_failed',
        resourceType: 'adapter_schema',
        resourceId: adapterId,
        userId: 'system',
        outcome: 'failure',
        severity: SecurityLevel.MODERATE,
        details: { adapterId, error: (error as Error).message },
      });
      throw error;
    }
  }

  /**
   * Create a new configuration instance
   */
  async createConfiguration(
    adapterId: string,
    config: Omit<AdapterConfiguration, 'id' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<AdapterConfiguration> {
    const schema = this.schemas.get(adapterId);
    if (!schema) {
      throw new Error(`No schema found for adapter: ${adapterId}`);
    }

    // Validate configuration against schema
    await this.validateConfiguration(config.configuration, schema, adapterId);

    const configId = uuidv4();
    const now = new Date();
    
    const configuration: AdapterConfiguration = {
      ...config,
      id: configId,
      adapterId,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };

    // Store configuration
    this.configurations.set(configId, configuration);
    
    // Save to file
    await this.saveConfiguration(configuration);
    
    // Create history entry
    await this.addHistoryEntry(configId, configuration.configuration, userId, 'Initial configuration');
    
    // Set as active if it's the default or first configuration
    if (configuration.isDefault || !this.activeConfigs.has(adapterId)) {
      await this.setActiveConfiguration(adapterId, configId, userId);
    }

    this.emit('configurationCreated', configuration);
    
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'adapter_configuration_created',
      resourceType: 'adapter_configuration',
      resourceId: configId,
      userId,
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        adapterId,
        configurationName: configuration.name,
        isDefault: configuration.isDefault,
        environment: configuration.environment,
      },
    });

    return configuration;
  }

  /**
   * Update an existing configuration
   */
  async updateConfiguration(
    configId: string,
    updates: Partial<Pick<AdapterConfiguration, 'name' | 'description' | 'configuration' | 'tags' | 'metadata'>>,
    userId: string,
    changeReason?: string
  ): Promise<AdapterConfiguration> {
    const existing = this.configurations.get(configId);
    if (!existing) {
      throw new Error(`Configuration not found: ${configId}`);
    }

    const schema = this.schemas.get(existing.adapterId);
    if (!schema) {
      throw new Error(`No schema found for adapter: ${existing.adapterId}`);
    }

    // Validate new configuration if provided
    if (updates.configuration) {
      await this.validateConfiguration(updates.configuration, schema, existing.adapterId);
    }

    // Create history entry before updating
    if (updates.configuration && JSON.stringify(updates.configuration) !== JSON.stringify(existing.configuration)) {
      await this.addHistoryEntry(configId, updates.configuration, userId, changeReason);
    }

    // Update configuration
    const updated: AdapterConfiguration = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    this.configurations.set(configId, updated);
    await this.saveConfiguration(updated);

    this.emit('configurationUpdated', { previous: existing, current: updated });
    
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'adapter_configuration_updated',
      resourceType: 'adapter_configuration',
      resourceId: configId,
      userId,
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        adapterId: existing.adapterId,
        configurationName: updated.name,
        changes: Object.keys(updates),
        changeReason,
      },
    });

    return updated;
  }

  /**
   * Delete a configuration
   */
  async deleteConfiguration(configId: string, userId: string): Promise<void> {
    const configuration = this.configurations.get(configId);
    if (!configuration) {
      throw new Error(`Configuration not found: ${configId}`);
    }

    // Don't allow deletion of active configuration
    if (this.activeConfigs.get(configuration.adapterId) === configId) {
      throw new Error('Cannot delete active configuration. Set another configuration as active first.');
    }

    // Remove from memory
    this.configurations.delete(configId);
    this.history.delete(configId);
    
    // Remove files
    await this.deleteConfigurationFile(configId);

    this.emit('configurationDeleted', configuration);
    
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'adapter_configuration_deleted',
      resourceType: 'adapter_configuration',
      resourceId: configId,
      userId,
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        adapterId: configuration.adapterId,
        configurationName: configuration.name,
      },
    });
  }

  /**
   * Set active configuration for an adapter
   */
  async setActiveConfiguration(adapterId: string, configId: string, userId: string): Promise<void> {
    const configuration = this.configurations.get(configId);
    if (!configuration) {
      throw new Error(`Configuration not found: ${configId}`);
    }

    if (configuration.adapterId !== adapterId) {
      throw new Error('Configuration does not belong to the specified adapter');
    }

    const previousActiveId = this.activeConfigs.get(adapterId);
    
    // Update active configuration
    this.activeConfigs.set(adapterId, configId);
    
    // Update configuration status
    if (previousActiveId) {
      const prevConfig = this.configurations.get(previousActiveId);
      if (prevConfig) {
        prevConfig.isActive = false;
        await this.saveConfiguration(prevConfig);
      }
    }
    
    configuration.isActive = true;
    await this.saveConfiguration(configuration);

    this.emit('activeConfigurationChanged', { adapterId, configId, previousActiveId });
    
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'adapter_active_configuration_changed',
      resourceType: 'adapter_configuration',
      resourceId: configId,
      userId,
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        adapterId,
        newActiveConfig: configId,
        previousActiveConfig: previousActiveId,
      },
    });
  }

  /**
   * Get active configuration for an adapter
   */
  getActiveConfiguration(adapterId: string): AdapterConfiguration | null {
    const activeConfigId = this.activeConfigs.get(adapterId);
    if (!activeConfigId) return null;
    
    return this.configurations.get(activeConfigId) || null;
  }

  /**
   * Get all configurations for an adapter
   */
  getAdapterConfigurations(adapterId: string): AdapterConfiguration[] {
    return Array.from(this.configurations.values())
      .filter(config => config.adapterId === adapterId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Get configuration by ID
   */
  getConfiguration(configId: string): AdapterConfiguration | null {
    return this.configurations.get(configId) || null;
  }

  /**
   * Get schema for an adapter
   */
  getSchema(adapterId: string): AdapterConfigSchema | null {
    return this.schemas.get(adapterId) || null;
  }

  /**
   * Get all registered schemas
   */
  getAllSchemas(): Record<string, AdapterConfigSchema> {
    return Object.fromEntries(this.schemas);
  }

  /**
   * Create configuration template
   */
  async createTemplate(
    template: Omit<ConfigurationTemplate, 'id' | 'createdAt' | 'usageCount'>,
    userId: string
  ): Promise<ConfigurationTemplate> {
    const schema = this.schemas.get(template.adapterId);
    if (!schema) {
      throw new Error(`No schema found for adapter: ${template.adapterId}`);
    }

    // Validate template configuration
    await this.validateConfiguration(template.configuration, schema, template.adapterId);

    const templateId = uuidv4();
    const newTemplate: ConfigurationTemplate = {
      ...template,
      id: templateId,
      createdAt: new Date(),
      createdBy: userId,
      usageCount: 0,
    };

    this.templates.set(templateId, newTemplate);
    await this.saveTemplate(newTemplate);

    this.emit('templateCreated', newTemplate);
    return newTemplate;
  }

  /**
   * Get configuration history
   */
  getConfigurationHistory(configId: string): ConfigurationHistory[] {
    return this.history.get(configId) || [];
  }

  /**
   * Validate configuration against schema
   */
  async validateConfiguration(
    config: Record<string, any>,
    schema: AdapterConfigSchema,
    adapterId: string
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check required properties
      if (schema.required) {
        for (const required of schema.required) {
          if (!(required in config) || config[required] === undefined || config[required] === null) {
            errors.push(`Missing required property: ${required}`);
          }
        }
      }

      // Validate each property
      for (const [key, value] of Object.entries(config)) {
        const property = schema.properties[key];
        if (!property) {
          warnings.push(`Unknown property: ${key}`);
          continue;
        }

        const propertyErrors = this.validateProperty(key, value, property);
        errors.push(...propertyErrors);
      }

      // Check dependencies
      if (schema.dependencies) {
        for (const [depKey, dependency] of Object.entries(schema.dependencies)) {
          if (this.evaluateCondition(dependency.condition, config)) {
            for (const prop of dependency.properties) {
              if (!(prop in config)) {
                errors.push(dependency.message || `Property ${prop} is required when ${depKey} condition is met`);
              }
            }
          }
        }
      }

      // Custom validation
      if (schema.validation?.rules) {
        for (const rule of schema.validation.rules) {
          if (this.evaluateCondition(rule.condition, config)) {
            if (rule.severity === 'error') {
              errors.push(rule.message);
            } else if (rule.severity === 'warning') {
              warnings.push(rule.message);
            }
          }
        }
      }

    } catch (error) {
      errors.push(`Validation error: ${(error as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // Private methods

  private ensureConfigDirectory(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
  }

  private async loadSchemas(): Promise<void> {
    const schemasPath = join(this.configDir, 'schemas.json');
    if (existsSync(schemasPath)) {
      try {
        const data = await fs.readFile(schemasPath, 'utf8');
        const schemas = JSON.parse(data);
        for (const [adapterId, schema] of Object.entries(schemas)) {
          this.schemas.set(adapterId, schema as AdapterConfigSchema);
        }
      } catch (error) {
        console.warn('Failed to load schemas:', error);
      }
    }
  }

  private async loadConfigurations(): Promise<void> {
    const configsPath = join(this.configDir, 'configurations.json');
    if (existsSync(configsPath)) {
      try {
        const data = await fs.readFile(configsPath, 'utf8');
        const configs = JSON.parse(data);
        for (const config of configs) {
          config.createdAt = new Date(config.createdAt);
          config.updatedAt = new Date(config.updatedAt);
          this.configurations.set(config.id, config);
          
          if (config.isActive) {
            this.activeConfigs.set(config.adapterId, config.id);
          }
        }
      } catch (error) {
        console.warn('Failed to load configurations:', error);
      }
    }
  }

  private async loadTemplates(): Promise<void> {
    const templatesPath = join(this.configDir, 'templates.json');
    if (existsSync(templatesPath)) {
      try {
        const data = await fs.readFile(templatesPath, 'utf8');
        const templates = JSON.parse(data);
        for (const template of templates) {
          template.createdAt = new Date(template.createdAt);
          this.templates.set(template.id, template);
        }
      } catch (error) {
        console.warn('Failed to load templates:', error);
      }
    }
  }

  private async loadHistory(): Promise<void> {
    const historyPath = join(this.configDir, 'history.json');
    if (existsSync(historyPath)) {
      try {
        const data = await fs.readFile(historyPath, 'utf8');
        const history = JSON.parse(data);
        for (const [configId, entries] of Object.entries(history)) {
          const historyEntries = (entries as any[]).map(entry => ({
            ...entry,
            changedAt: new Date(entry.changedAt),
          }));
          this.history.set(configId, historyEntries);
        }
      } catch (error) {
        console.warn('Failed to load history:', error);
      }
    }
  }

  private async saveSchema(adapterId: string, schema: AdapterConfigSchema): Promise<void> {
    const schemasPath = join(this.configDir, 'schemas.json');
    const schemas = Object.fromEntries(this.schemas);
    await fs.writeFile(schemasPath, JSON.stringify(schemas, null, 2));
  }

  private async saveConfiguration(configuration: AdapterConfiguration): Promise<void> {
    const configsPath = join(this.configDir, 'configurations.json');
    const configs = Array.from(this.configurations.values());
    await fs.writeFile(configsPath, JSON.stringify(configs, null, 2));
  }

  private async saveTemplate(template: ConfigurationTemplate): Promise<void> {
    const templatesPath = join(this.configDir, 'templates.json');
    const templates = Array.from(this.templates.values());
    await fs.writeFile(templatesPath, JSON.stringify(templates, null, 2));
  }

  private async deleteConfigurationFile(configId: string): Promise<void> {
    // Remove from configurations file
    await this.saveConfiguration({ id: 'dummy' } as any); // Trigger save without the deleted config
  }

  private async addHistoryEntry(
    configId: string,
    configuration: Record<string, any>,
    userId: string,
    reason?: string
  ): Promise<void> {
    const history = this.history.get(configId) || [];
    const version = history.length + 1;
    
    const entry: ConfigurationHistory = {
      configurationId: configId,
      version,
      configuration,
      changedBy: userId,
      changedAt: new Date(),
      changeReason: reason,
      previousVersion: version > 1 ? version - 1 : undefined,
    };

    history.push(entry);
    this.history.set(configId, history);
    
    // Save history
    const historyPath = join(this.configDir, 'history.json');
    const allHistory = Object.fromEntries(this.history);
    await fs.writeFile(historyPath, JSON.stringify(allHistory, null, 2));
  }

  private validateSchema(schema: AdapterConfigSchema): void {
    if (!schema.name || !schema.version) {
      throw new Error('Schema must have name and version');
    }
    
    if (!schema.properties || Object.keys(schema.properties).length === 0) {
      throw new Error('Schema must have at least one property');
    }

    // Validate each property definition
    for (const [key, property] of Object.entries(schema.properties)) {
      if (!property.type) {
        throw new Error(`Property ${key} must have a type`);
      }
      
      const validTypes = ['string', 'number', 'boolean', 'array', 'object', 'select', 'file', 'directory'];
      if (!validTypes.includes(property.type)) {
        throw new Error(`Property ${key} has invalid type: ${property.type}`);
      }
    }
  }

  private validateProperty(key: string, value: any, property: ConfigProperty): string[] {
    const errors: string[] = [];

    // Type validation
    switch (property.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`Property ${key} must be a string`);
        } else {
          if (property.pattern && !new RegExp(property.pattern).test(value)) {
            errors.push(`Property ${key} does not match required pattern`);
          }
          if (property.min !== undefined && value.length < property.min) {
            errors.push(`Property ${key} must be at least ${property.min} characters long`);
          }
          if (property.max !== undefined && value.length > property.max) {
            errors.push(`Property ${key} must be at most ${property.max} characters long`);
          }
        }
        break;
        
      case 'number':
        if (typeof value !== 'number') {
          errors.push(`Property ${key} must be a number`);
        } else {
          if (property.min !== undefined && value < property.min) {
            errors.push(`Property ${key} must be at least ${property.min}`);
          }
          if (property.max !== undefined && value > property.max) {
            errors.push(`Property ${key} must be at most ${property.max}`);
          }
        }
        break;
        
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`Property ${key} must be a boolean`);
        }
        break;
        
      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`Property ${key} must be an array`);
        }
        break;
        
      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`Property ${key} must be an object`);
        }
        break;
        
      case 'select':
        if (property.options && !property.options.includes(value)) {
          errors.push(`Property ${key} must be one of: ${property.options.join(', ')}`);
        }
        break;
    }

    return errors;
  }

  private evaluateCondition(condition: string, config: Record<string, any>): boolean {
    try {
      // Simple condition evaluation (in production, use a safe expression evaluator)
      const func = new Function('config', `return ${condition}`);
      return func(config);
    } catch (error) {
      console.warn('Failed to evaluate condition:', condition, error);
      return false;
    }
  }
}

// Export singleton instance
export const adapterConfigManager = AdapterConfigurationManager.getInstance();