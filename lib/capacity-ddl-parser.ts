import type { ParsedColumn, ParsedTable } from "./types";
import type {
  CapacityTable,
  CapacityIndex,
} from "./tablespace-types";

/**
 * Extended DDL parser that extracts tables AND indexes from a full DDL script.
 *
 * Handles:
 * - CREATE TABLE with inline PK / UNIQUE constraints
 * - CREATE [UNIQUE] INDEX statements
 * - Multiple tables in a single DDL script
 */

const NON_COLUMN_START =
  /^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|PARTITION|SUBPARTITION|SUPPLEMENTAL|USING|LOB|PERIOD)\\b/i;

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** Split a top-level list on commas at bracket depth zero. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Average stored length for an Oracle datatype. Reuses logic from ddl-parser. */
function inferAvgLength(dataType: string): number {
  const t = dataType.toUpperCase().trim();
  const size = Number(t.match(/\(\s*(\d+)/)?.[1] ?? 0);

  if (/^N?VARCHAR2?/.test(t) || /^VARCHAR/.test(t)) {
    const bytes = t.startsWith("N") ? size * 2 : size;
    return Math.max(1, Math.round(bytes * 0.5));
  }
  if (/^N?CHAR/.test(t)) return Math.max(1, t.startsWith("N") ? size * 2 : size);
  if (/^NUMBER|^DECIMAL|^NUMERIC|^INTEGER|^INT\b|^FLOAT/.test(t)) {
    const precision = size || 10;
    return Math.min(22, Math.ceil(precision / 2) + 1);
  }
  if (/^TIMESTAMP.*TIME ZONE/.test(t)) return 13;
  if (/^TIMESTAMP/.test(t)) return 11;
  if (/^DATE/.test(t)) return 7;
  if (/^RAW/.test(t)) return Math.max(1, size);
  if (/^ROWID/.test(t)) return 10;
  if (/^INTERVAL/.test(t)) return 11;
  if (/^(CLOB|BLOB|NCLOB|BFILE|LONG|XMLTYPE)/.test(t)) return 36; // LOB locator for capacity planning
  return 8;
}

const unquote = (s?: string) => s?.replace(/"/g, "").trim();

interface ParsedTableRaw {
  schema?: string;
  name: string;
  columns: ParsedColumn[];
  pkColumns: string[];
  uniqueConstraints: { name: string; columns: string[] }[];
}

function parseOneTable(cleaned: string, headerMatch: RegExpMatchArray): ParsedTableRaw | null {
  const open = cleaned.indexOf("(", headerMatch.index! + headerMatch[0].length - 1);
  let depth = 0;
  let close = -1;
  for (let i = open; i < cleaned.length; i += 1) {
    if (cleaned[i] === "(") depth += 1;
    if (cleaned[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return null;

  const schema = headerMatch[2] ? unquote(headerMatch[1]) : undefined;
  const name = unquote(headerMatch[2] ?? headerMatch[1])!;

  const columns: ParsedColumn[] = [];
  const pkColumns: string[] = [];
  const uniqueConstraints: { name: string; columns: string[] }[] = [];

  for (const raw of splitTopLevel(cleaned.slice(open + 1, close))) {
    const part = raw.trim().replace(/\s+/g, " ");
    if (!part) continue;

    // Inline PRIMARY KEY constraint
    const pkMatch = part.match(/(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (pkMatch) {
      pkColumns.push(
        ...pkMatch[1].split(",").map((c) => unquote(c.trim())!),
      );
      continue;
    }

    // Inline UNIQUE constraint
    const uqMatch = part.match(/(?:CONSTRAINT\s+(\S+)\s+)?UNIQUE\s*\(([^)]+)\)/i);
    if (uqMatch) {
      const cName = uqMatch[1] ? unquote(uqMatch[1])! : `UQ_${name}_${uniqueConstraints.length + 1}`;
      uniqueConstraints.push({
        name: cName,
        columns: uqMatch[2].split(",").map((c) => unquote(c.trim())!),
      });
      continue;
    }

    if (NON_COLUMN_START.test(part)) continue;

    const m = part.match(/^("?[\w$#]+"?)\s+([\w ]+(?:\(\s*\d+(?:\s*,\s*\d+)?\s*(?:BYTE|CHAR)?\s*\))?)/i);
    if (!m) continue;

    const colName = unquote(m[1])!;
    const dataType = m[2].trim().toUpperCase();
    const avgLength = inferAvgLength(dataType);

    columns.push({
      name: colName,
      dataType,
      avgLength,
      nullable: !/NOT\s+NULL/i.test(part),
    });
  }

  return { schema, name, columns, pkColumns, uniqueConstraints };
}

function parseIndexStatements(cleaned: string): CapacityIndex[] {
  const indexes: CapacityIndex[] = [];
  const indexRe =
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:"?[\w$#]+"?\s*\.\s*)?("?[\w$#]+"?)\s+ON\s+(?:"?[\w$#]+"?\s*\.\s*)?("?[\w$#]+"?)\s*\(([^)]+)\)/gi;

  let match;
  while ((match = indexRe.exec(cleaned)) !== null) {
    const unique = !!match[1];
    const indexName = unquote(match[2])!;
    const tableName = unquote(match[3])!;
    const columns = match[4].split(",").map((c) => {
      // Strip ASC/DESC and function wrappings for simplicity
      return unquote(c.trim().replace(/\s+(ASC|DESC)\s*$/i, ""))!;
    });
    indexes.push({ name: indexName, tableName, columns, unique });
  }

  return indexes;
}

export interface CapacityParseOutcome {
  tables: CapacityTable[];
  error: string | null;
  warnings: string[];
}

/**
 * Parse a full DDL script into tables and indexes for capacity planning.
 * Supports multiple CREATE TABLE and CREATE INDEX statements.
 */
export function parseCapacityDdl(sql: string): CapacityParseOutcome {
  const cleaned = stripComments(sql);
  const warnings: string[] = [];

  // Find all CREATE TABLE statements
  const tableRe =
    /CREATE\s+(?:GLOBAL\s+TEMPORARY\s+|PRIVATE\s+TEMPORARY\s+)?TABLE\s+("?[\w$#]+"?)(?:\s*\.\s*("?[\w$#]+"?))?\s*\(/gi;

  const rawTables: ParsedTableRaw[] = [];
  let tableMatch;
  while ((tableMatch = tableRe.exec(cleaned)) !== null) {
    const parsed = parseOneTable(cleaned, tableMatch);
    if (parsed && parsed.columns.length > 0) {
      rawTables.push(parsed);
    }
  }

  if (rawTables.length === 0) {
    return {
      tables: [],
      error: "No CREATE TABLE statements found. Paste one or more CREATE TABLE statements with column definitions.",
      warnings,
    };
  }

  // Parse all CREATE INDEX statements
  const explicitIndexes = parseIndexStatements(cleaned);

  // Build CapacityTable objects
  const tables: CapacityTable[] = rawTables.map((raw) => {
    const indexes: CapacityIndex[] = [];

    // Add PK as an implicit unique index
    if (raw.pkColumns.length > 0) {
      indexes.push({
        name: `PK_${raw.name.toUpperCase()}`,
        tableName: raw.name,
        columns: raw.pkColumns,
        unique: true,
      });
    }

    // Add inline UNIQUE constraints as indexes
    for (const uq of raw.uniqueConstraints) {
      indexes.push({
        name: uq.name,
        tableName: raw.name,
        columns: uq.columns,
        unique: true,
      });
    }

    // Add explicit CREATE INDEX that reference this table
    for (const idx of explicitIndexes) {
      if (idx.tableName.toUpperCase() === raw.name.toUpperCase()) {
        indexes.push(idx);
      }
    }

    return {
      schema: raw.schema,
      name: raw.name,
      columns: raw.columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
        avgLength: c.avgLength,
        nullable: c.nullable,
      })),
      pkColumns: raw.pkColumns,
      indexes,
    };
  });

  // Add indexes for tables not found in the DDL (orphan indexes)
  const tableNames = new Set(rawTables.map((t) => t.name.toUpperCase()));
  for (const idx of explicitIndexes) {
    if (!tableNames.has(idx.tableName.toUpperCase())) {
      warnings.push(
        `Index ${idx.name} references table ${idx.tableName} which was not found in the DDL. It will be skipped.`,
      );
    }
  }

  return { tables, error: null, warnings };
}
