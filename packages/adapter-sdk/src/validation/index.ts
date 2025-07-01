import type {
  AdapterConfig,
  AdapterCapability,
  AdapterMetadata,
} from '../types/index.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AdapterValidationOptions {
  strict?: boolean;
  requireAllCapabilities?: boolean;
  maxNameLength?: number;
  maxDescriptionLength?: number;
}

export class AdapterValidator {
  private options: Required<AdapterValidationOptions>;

  constructor(options: AdapterValidationOptions = {}) {
    this.options = {
      strict: options.strict ?? false,
      requireAllCapabilities: options.requireAllCapabilities ?? false,
      maxNameLength: options.maxNameLength ?? 50,
      maxDescriptionLength: options.maxDescriptionLength ?? 200,
    };
  }

  validateAdapter(adapter: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if adapter has required methods
    const requiredMethods = [
      'getName',
      'getVersion',
      'getDescription',
      'getCapabilities',
      'initialize',
      'execute',
      'cleanup',
    ];

    for (const method of requiredMethods) {
      if (typeof adapter[method] !== 'function') {
        errors.push(`Missing required method: ${method}`);
      }
    }

    // Validate metadata if available
    try {
      const name = adapter.getName?.();
      const version = adapter.getVersion?.();
      const description = adapter.getDescription?.();
      const capabilities = adapter.getCapabilities?.();

      if (name) {
        const nameValidation = this.validateName(name);
        errors.push(...nameValidation.errors);
        warnings.push(...nameValidation.warnings);
      }

      if (version) {
        const versionValidation = this.validateVersion(version);
        errors.push(...versionValidation.errors);
        warnings.push(...versionValidation.warnings);
      }

      if (description) {
        const descValidation = this.validateDescription(description);
        errors.push(...descValidation.errors);
        warnings.push(...descValidation.warnings);
      }

      if (capabilities) {
        const capValidation = this.validateCapabilities(capabilities);
        errors.push(...capValidation.errors);
        warnings.push(...capValidation.warnings);
      }
    } catch (error) {
      errors.push(`Error accessing adapter metadata: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateConfig(config: AdapterConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!config.name || typeof config.name !== 'string') {
      errors.push('Config name is required and must be a string');
    }

    if (!config.version || typeof config.version !== 'string') {
      errors.push('Config version is required and must be a string');
    }

    if (!config.entry || typeof config.entry !== 'string') {
      errors.push('Config entry point is required and must be a string');
    }

    // Validate optional fields
    if (config.description && typeof config.description !== 'string') {
      errors.push('Config description must be a string');
    }

    if (config.dependencies) {
      if (
        typeof config.dependencies !== 'object' ||
        Array.isArray(config.dependencies)
      ) {
        errors.push('Config dependencies must be an object');
      } else {
        for (const [name, version] of Object.entries(config.dependencies)) {
          if (typeof name !== 'string' || typeof version !== 'string') {
            errors.push(`Invalid dependency: ${name} -> ${version}`);
          }
        }
      }
    }

    if (config.environment) {
      if (!Array.isArray(config.environment)) {
        errors.push('Config environment must be an array');
      } else {
        for (const env of config.environment) {
          if (typeof env !== 'string') {
            errors.push('Environment entries must be strings');
          }
        }
      }
    }

    if (config.capabilities) {
      const capValidation = this.validateCapabilities(config.capabilities);
      errors.push(...capValidation.errors);
      warnings.push(...capValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateName(name: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name || typeof name !== 'string') {
      errors.push('Name is required and must be a string');
      return { isValid: false, errors, warnings };
    }

    if (name.length === 0) {
      errors.push('Name cannot be empty');
    }

    if (name.length > this.options.maxNameLength) {
      errors.push(
        `Name exceeds maximum length of ${this.options.maxNameLength} characters`
      );
    }

    // Check for valid characters
    if (!/^[a-zA-Z0-9\-_\s]+$/.test(name)) {
      errors.push(
        'Name contains invalid characters. Use only letters, numbers, hyphens, underscores, and spaces.'
      );
    }

    // Warnings
    if (name.includes('  ')) {
      warnings.push('Name contains multiple consecutive spaces');
    }

    if (name.startsWith(' ') || name.endsWith(' ')) {
      warnings.push('Name has leading or trailing spaces');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateVersion(version: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!version || typeof version !== 'string') {
      errors.push('Version is required and must be a string');
      return { isValid: false, errors, warnings };
    }

    // Basic semver check
    const semverRegex =
      /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9\-]+))?(?:\+([a-zA-Z0-9\-]+))?$/;

    if (!semverRegex.test(version)) {
      errors.push(
        'Version must follow semantic versioning (e.g., 1.0.0, 1.0.0-alpha, 1.0.0+build)'
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateDescription(description: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!description || typeof description !== 'string') {
      if (this.options.strict) {
        errors.push('Description is required and must be a string');
      } else {
        warnings.push('Description is recommended');
      }
      return { isValid: errors.length === 0, errors, warnings };
    }

    if (description.length > this.options.maxDescriptionLength) {
      errors.push(
        `Description exceeds maximum length of ${this.options.maxDescriptionLength} characters`
      );
    }

    if (description.length < 10) {
      warnings.push(
        'Description is very short. Consider providing more details.'
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateCapabilities(
    capabilities: AdapterCapability[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(capabilities)) {
      errors.push('Capabilities must be an array');
      return { isValid: false, errors, warnings };
    }

    const validCapabilities: AdapterCapability[] = [
      'execute',
      'interactive',
      'file-operations',
      'git-integration',
      'network-access',
      'system-commands',
    ];

    const seenCapabilities = new Set<string>();

    for (const capability of capabilities) {
      if (typeof capability !== 'string') {
        errors.push('Each capability must be a string');
        continue;
      }

      if (!validCapabilities.includes(capability)) {
        errors.push(
          `Invalid capability: ${capability}. Valid capabilities are: ${validCapabilities.join(', ')}`
        );
      }

      if (seenCapabilities.has(capability)) {
        warnings.push(`Duplicate capability: ${capability}`);
      }

      seenCapabilities.add(capability);
    }

    if (
      this.options.requireAllCapabilities &&
      capabilities.length !== validCapabilities.length
    ) {
      warnings.push(
        'Not all capabilities are declared. Consider adding missing capabilities.'
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export function validateAdapter(
  adapter: any,
  options?: AdapterValidationOptions
): ValidationResult {
  const validator = new AdapterValidator(options);
  return validator.validateAdapter(adapter);
}

export function validateAdapterConfig(
  config: AdapterConfig,
  options?: AdapterValidationOptions
): ValidationResult {
  const validator = new AdapterValidator(options);
  return validator.validateConfig(config);
}
