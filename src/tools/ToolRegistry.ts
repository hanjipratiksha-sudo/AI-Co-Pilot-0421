/**
 * Tool Registry & Schema Validator
 * Validates tool signatures, parameter types, and constraints
 */

import { ToolDefinition } from '../types/tool.js';
import { BUILT_IN_TOOLS } from './built-in-tools.js';

export class ToolNotFoundError extends Error {
  constructor(public readonly toolName: string) {
    super(`Tool '${toolName}' is not registered in the tool registry`);
    this.name = 'ToolNotFoundError';
  }
}

export class ToolParameterValidationError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly errors: string[]
  ) {
    super(`Validation failed for tool '${toolName}': ${errors.join('; ')}`);
    this.name = 'ToolParameterValidationError';
  }
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(loadBuiltIns = true) {
    if (loadBuiltIns) {
      this.loadBuiltIns();
    }
  }

  public loadBuiltIns(): void {
    for (const tool of Object.values(BUILT_IN_TOOLS)) {
      this.register(tool);
    }
  }

  public register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public require(name: string): ToolDefinition {
    const tool = this.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }
    return tool;
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Validate runtime parameters against the tool's parameter schema
   */
  public validateParameters(toolName: string, params: Record<string, unknown>): void {
    const tool = this.require(toolName);
    const schema = tool.parameters;
    const errors: string[] = [];

    // Check required fields
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (params[requiredField] === undefined || params[requiredField] === null) {
          errors.push(`Missing required parameter '${requiredField}'`);
        }
      }
    }

    // Check types and property constraints
    for (const [propName, propDef] of Object.entries(schema.properties)) {
      const val = params[propName];
      if (val === undefined || val === null) {
        if (propDef.required) {
          errors.push(`Missing required parameter '${propName}'`);
        }
        continue;
      }

      // Check type
      const actualType = Array.isArray(val) ? 'array' : typeof val;
      if (actualType !== propDef.type) {
        errors.push(
          `Parameter '${propName}' expected type '${propDef.type}', got '${actualType}'`
        );
      }

      // Check enum
      if (propDef.enum && !propDef.enum.includes(val as never)) {
        errors.push(
          `Parameter '${propName}' must be one of [${propDef.enum.join(', ')}], got '${String(val)}'`
        );
      }
    }

    if (errors.length > 0) {
      throw new ToolParameterValidationError(toolName, errors);
    }
  }
}
