import artifact from "./generated/public-api.json";
import { PUBLIC_API_BASE_URL } from "./constants";

export interface Schema {
  $ref?: string;
  type?: string;
  format?: string;
  description?: string;
  nullable?: boolean;
  default?: unknown;
  example?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
}
export interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema: Schema;
  example?: unknown;
}
export interface WorkedExample { summary: string; value: unknown; 'x-request'?: string }
export interface ApiResponse {
  description: string;
  content?: Record<string, { schema: Schema; examples?: Record<string, WorkedExample> }>;
  headers?: Record<string, { description: string; schema: Schema }>;
}
export interface Operation {
  operationId: string;
  summary: string;
  parameters?: Parameter[];
  responses: Record<string, ApiResponse>;
  security: Record<string, string[]>[];
}
interface Document {
  paths: Record<string, { get: Operation }>;
  components: { schemas: Record<string, Schema> };
}
export const referenceDocument = artifact as unknown as Document;

// Human guidance is keyed by stable public paths, never a second schema catalogue.
export const ENDPOINTS = [
  {
    id: "list-securities",
    key: "securities",
    path: "/public/v1/securities",
  },
  {
    id: "get-security",
    key: "security",
    path: "/public/v1/securities/{symbol}",
  },
  {
    id: "get-ohlcv",
    key: "ohlcv",
    path: "/public/v1/securities/{symbol}/ohlcv",
  },
  {
    id: "list-indices",
    key: "indices",
    path: "/public/v1/indices",
  },
  {
    id: "get-index-values",
    key: "values",
    path: "/public/v1/indices/{code}/values",
  },
  {
    id: "get-eod",
    key: "eod",
    path: "/public/v1/eod",
  },
] as const;
export type Endpoint = (typeof ENDPOINTS)[number];
export type Language = "curl" | "python" | "javascript";

export function resolveSchema(schema: Schema): Schema {
  if (schema.$ref)
    return {
      ...referenceDocument.components.schemas[schema.$ref.split("/").pop()!],
      ...schema,
      $ref: undefined,
    };
  if (schema.allOf)
    return Object.assign({}, ...schema.allOf.map(resolveSchema), schema, {
      allOf: undefined,
    });
  return schema;
}
const ERROR_VARIANT_LABELS: Record<string, string> = {
  RateLimitedErrorBodySchema: "Per-key quota error",
  EdgeRateLimitedErrorBodySchema: "Per-IP rate-limit error",
};

function errorVariantLabel(schema: Schema): string | undefined {
  return schema.$ref
    ? ERROR_VARIANT_LABELS[schema.$ref.split("/").pop()!]
    : undefined;
}

export function schemaType(input: Schema): string {
  const schema = resolveSchema(input);
  const variants = schema.oneOf ?? schema.anyOf;
  let type: string;
  if (variants) type = variants.map((variant) => errorVariantLabel(variant) ?? (variant.$ref ? variant.$ref.split('/').pop()!.replace(/^Public/, '').replace(/Schema$/, '') : schemaType(variant))).join(' | ');
  else if (schema.type === 'array') {
    const itemType = schemaType(schema.items ?? {});
    type = `${itemType.includes(' | ') ? `(${itemType})` : itemType}[]`;
  } else type = schema.type ?? 'object';
  return `${type}${schema.format ? ` (${schema.format})` : ''}${schema.nullable ? ' | null' : ''}`;
}
export function schemaExample(input: Schema): unknown {
  const schema = resolveSchema(input);
  if (schema.example !== undefined) return schema.example;
  if (schema.oneOf ?? schema.anyOf) return schemaExample((schema.oneOf ?? schema.anyOf)![0]);
  if (schema.enum) return schema.enum[0];
  if (schema.type === "array") return [schemaExample(schema.items ?? {})];
  if (schema.properties)
    return Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        schemaExample(value),
      ]),
    );
  if (schema.nullable) return null;
  return schema.type === "string"
    ? "string"
    : schema.type === "boolean"
      ? true
      : 0;
}
export interface Field {
  name: string;
  type: string;
  description: string;
  required: boolean;
}
export function schemaFields(input: Schema, prefix = "", depth = 0): Field[] {
  if (depth > 10) return [];
  const schema = resolveSchema(input);
  if (schema.oneOf ?? schema.anyOf)
    return (schema.oneOf ?? schema.anyOf)!.flatMap((variant, index) =>
      schemaFields(variant, `${prefix} (${errorVariantLabel(variant) ?? index + 1})`, depth + 1),
    );
  if (schema.type === "array")
    return schemaFields(schema.items ?? {}, `${prefix}[]`, depth + 1);
  return Object.entries(schema.properties ?? {}).flatMap(([key, property]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    return [
      {
        name,
        type: schemaType(property),
        description: [resolveSchema(property).description ?? "", resolveSchema(property).enum ? `Allowed values: ${resolveSchema(property).enum!.map(String).join(" / ")}.` : ""].filter(Boolean).join(" "),
        required: (schema.required ?? []).includes(key),
      },
      ...schemaFields(property, name, depth + 1),
    ];
  });
}
export function parameterDetails(parameter: Parameter): string {
  const s = parameter.schema;
  return [
    parameter.description,
    s.enum ? s.enum.join(" / ") : "",
    s.default !== undefined ? `Default: ${s.default}.` : "",
    s.minimum !== undefined ? `Minimum: ${s.minimum}.` : "",
    s.maximum !== undefined ? `Maximum: ${s.maximum}.` : "",
    s.minLength !== undefined ? `Min length: ${s.minLength}.` : "",
    s.maxLength !== undefined ? `Max length: ${s.maxLength}.` : "",
    parameter.example !== undefined ? `Example: ${parameter.example}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
export function operationExamples(endpoint: Endpoint): Record<string, WorkedExample> {
  return referenceDocument.paths[endpoint.path].get.responses['200'].content?.['application/json'].examples ?? {};
}
export function requestSnippet(endpoint: Endpoint, language: Language, exampleKey = 'primary'): string {
  const request = operationExamples(endpoint)[exampleKey]?.['x-request'];
  if (!request) throw new Error(`Missing paired request example: ${endpoint.path}/${exampleKey}`);
  const url = `${PUBLIC_API_BASE_URL}${request}`;
  if (language === "curl")
    return `curl --fail-with-body "${url}" \\\n  -H "X-API-Key: YOUR_KEY"`;
  if (language === "python")
    return `# Requires: pip install requests\nimport requests\n\nresponse = requests.get(\n    "${url}",\n    headers={"X-API-Key": "YOUR_KEY"},\n    timeout=30,\n)\nresponse.raise_for_status()\npayload = response.json()\nprint(payload)`;
  return `const response = await fetch(\n  "${url}",\n  { headers: { "X-API-Key": "YOUR_KEY" } },\n);\nif (!response.ok) {\n  throw new Error("HTTP " + response.status + ": " + await response.text());\n}\nconst payload = await response.json();\nconsole.log(payload);`;
}
export const PAGINATION_EXAMPLE = `# Requires: pip install requests\nimport os\nimport requests\n\n# Set TRADEIQ_API_KEY in your environment; never commit a real key.\nheaders = {"X-API-Key": os.environ["TRADEIQ_API_KEY"]}\npage = 1\nwhile True:\n    response = requests.get(\n        "${PUBLIC_API_BASE_URL}/securities",\n        headers=headers,\n        params={"page": page, "page_size": 200},\n        timeout=30,\n    )\n    response.raise_for_status()\n    payload = response.json()\n    for security in payload["data"]:\n        print(security["symbol"])\n    meta = payload["meta"]\n    if page * meta["page_size"] >= meta["total"] or not payload["data"]:\n        break\n    page += 1`;
