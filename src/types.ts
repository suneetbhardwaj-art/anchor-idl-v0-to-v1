/**
 * Anchor IDL v0 types (pre-0.30 / legacy)
 * Fields: isMut, isSigner, camelCase account names, top-level name/version
 */

export interface IdlV0AccountMeta {
  name: string;
  isMut: boolean;
  isSigner: boolean;
  docs?: string[];
  pda?: {
    seeds: IdlV0Seed[];
  };
  relations?: string[];
}

export interface IdlV0Seed {
  kind: "const" | "arg" | "account";
  type?: string;
  value?: unknown;
  path?: string;
}

export interface IdlV0TypeArg {
  name: string;
  type: IdlV0TypeDef | string;
}

export type IdlV0TypeDef =
  | string
  | { vec: IdlV0TypeDef }
  | { option: IdlV0TypeDef }
  | { array: [IdlV0TypeDef, number] }
  | { defined: string }
  | { coption: IdlV0TypeDef };

export interface IdlV0Field {
  name: string;
  type: IdlV0TypeDef;
  docs?: string[];
}

export interface IdlV0TypeVariant {
  name: string;
  fields?: IdlV0Field[] | IdlV0TypeDef[];
}

export interface IdlV0TypeDefinition {
  name: string;
  docs?: string[];
  type:
    | { kind: "struct"; fields: IdlV0Field[] }
    | { kind: "enum"; variants: IdlV0TypeVariant[] };
}

export interface IdlV0Instruction {
  name: string;
  docs?: string[];
  accounts: IdlV0AccountMeta[];
  args: IdlV0TypeArg[];
  returns?: IdlV0TypeDef;
}

export interface IdlV0Account {
  name: string;
  docs?: string[];
  type: {
    kind: "struct";
    fields: IdlV0Field[];
  };
}

export interface IdlV0Event {
  name: string;
  fields: IdlV0Field[];
}

export interface IdlV0Error {
  code: number;
  name: string;
  msg?: string;
}

export interface IdlV0 {
  version: string;
  name: string;
  docs?: string[];
  instructions: IdlV0Instruction[];
  accounts?: IdlV0Account[];
  types?: IdlV0TypeDefinition[];
  events?: IdlV0Event[];
  errors?: IdlV0Error[];
  constants?: Array<{ name: string; type: string; value: string }>;
  metadata?: {
    address?: string;
    origin?: string;
    deployments?: unknown;
  };
}

/**
 * Anchor IDL v1 types (v0.30+ / new spec)
 * Fields: writable, signer, snake_case account names, top-level address
 */

export interface IdlV1AccountMeta {
  name: string;
  writable?: boolean;
  signer?: boolean;
  optional?: boolean;
  docs?: string[];
  address?: string;
  pda?: {
    seeds: IdlV1Seed[];
  };
  relations?: string[];
}

export interface IdlV1Seed {
  kind: "const" | "arg" | "account";
  type?: string;
  value?: unknown;
  path?: string;
  account?: string;
}

export interface IdlV1TypeArg {
  name: string;
  type: IdlV1TypeDef | string;
  docs?: string[];
}

export type IdlV1TypeDef =
  | string
  | { vec: IdlV1TypeDef }
  | { option: IdlV1TypeDef }
  | { array: [IdlV1TypeDef, number] }
  | { defined: { name: string; generics?: IdlV1TypeDef[] } }
  | { coption: IdlV1TypeDef };

export interface IdlV1Field {
  name: string;
  type: IdlV1TypeDef;
  docs?: string[];
}

export interface IdlV1TypeVariant {
  name: string;
  fields?: IdlV1Field[];
}

export interface IdlV1TypeDefinition {
  name: string;
  docs?: string[];
  serialization?: string;
  repr?: { kind: string; modifier?: string };
  generics?: Array<{ kind: string; name: string }>;
  type:
    | { kind: "struct"; fields: IdlV1Field[] }
    | { kind: "enum"; variants: IdlV1TypeVariant[] }
    | { kind: "type"; alias: IdlV1TypeDef };
}

export interface IdlV1Instruction {
  name: string;
  docs?: string[];
  discriminator: number[];
  accounts: IdlV1AccountMeta[];
  args: IdlV1TypeArg[];
  returns?: IdlV1TypeDef;
}

export interface IdlV1Account {
  name: string;
  docs?: string[];
  discriminator: number[];
  type: {
    kind: "struct";
    fields: IdlV1Field[];
  };
}

export interface IdlV1Event {
  name: string;
  discriminator: number[];
  fields: IdlV1Field[];
}

export interface IdlV1Error {
  code: number;
  name: string;
  msg?: string;
}

export interface IdlV1Metadata {
  name: string;
  version: string;
  spec: string;
  description?: string;
  repository?: string;
  dependencies?: Array<{ name: string; version: string }>;
  contact?: string;
  deployments?: unknown;
}

export interface IdlV1 {
  address: string;
  metadata: IdlV1Metadata;
  docs?: string[];
  instructions: IdlV1Instruction[];
  accounts?: IdlV1Account[];
  types?: IdlV1TypeDefinition[];
  events?: IdlV1Event[];
  errors?: IdlV1Error[];
  constants?: Array<{ name: string; type: IdlV1TypeDef; value: string }>;
}

/** Result of a migration */
export interface MigrationResult {
  success: boolean;
  outputIdl?: IdlV1;
  warnings: string[];
  errors: string[];
  stats: {
    instructionsConverted: number;
    accountsConverted: number;
    typesConverted: number;
    eventsConverted: number;
    errorsConverted: number;
    accountFieldsRenamed: number;
    pdaSeedsConverted: number;
  };
}
