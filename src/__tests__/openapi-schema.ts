import fs from "fs";
import path from "path";
import { Ajv, type ValidateFunction } from "ajv";
import yaml from "js-yaml";

type CompiledValidator = ValidateFunction;

const specPath = path.resolve(process.cwd(), "openapi.yaml");
const rawSpec = fs.readFileSync(specPath, "utf8");
const spec = yaml.load(rawSpec) as {
  components: { schemas: Record<string, unknown> };
};

const normalizeNullable = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeNullable);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized = Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key !== "nullable")
      .map(([key, entryValue]) => [key, normalizeNullable(entryValue)]),
  );

  if (record.nullable === true) {
    return {
      anyOf: [normalized, { type: "null" }],
    };
  }

  return normalized;
};

const definitions = JSON.parse(
  JSON.stringify(normalizeNullable(spec.components.schemas)).replace(
    /#\/components\/schemas\//g,
    "#/definitions/",
  ),
) as Record<string, unknown>;

const ajv = new Ajv({ allErrors: true, strict: false });
const arrayValidators = new Map<string, CompiledValidator>();
const objectValidators = new Map<string, CompiledValidator>();

const getArrayValidator = (schemaName: string): CompiledValidator => {
  let validator = arrayValidators.get(schemaName);
  if (!validator) {
    validator = ajv.compile({
      type: "array",
      items: { $ref: `#/definitions/${schemaName}` },
      definitions,
    });
    arrayValidators.set(schemaName, validator);
  }
  return validator;
};

const getObjectValidator = (schemaName: string): CompiledValidator => {
  let validator = objectValidators.get(schemaName);
  if (!validator) {
    validator = ajv.compile({
      $ref: `#/definitions/${schemaName}`,
      definitions,
    });
    objectValidators.set(schemaName, validator);
  }
  return validator;
};

const assertValid = (
  validator: CompiledValidator,
  schemaName: string,
  value: unknown,
): void => {
  if (!validator(value)) {
    throw new Error(
      `OpenAPI schema ${schemaName} validation failed: ${ajv.errorsText(
        validator.errors,
      )}`,
    );
  }
};

export const expectArraySchema = (
  schemaName: string,
  value: unknown,
): void => {
  assertValid(getArrayValidator(schemaName), schemaName, value);
};

export const expectObjectSchema = (
  schemaName: string,
  value: unknown,
): void => {
  assertValid(getObjectValidator(schemaName), schemaName, value);
};
