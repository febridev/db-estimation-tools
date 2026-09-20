import type { ParsedColumn, ParsedTable } from "./types";

/**
 * Average stored length for an Oracle datatype.
 * Character types are declared at their maximum; real data is shorter, so a
 * fill ratio is applied. Numeric and temporal types have fixed internal widths.
 */
export function inferAvgLength(dataType: string): number {
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
  if (/^(CLOB|BLOB|NCLOB|BFILE|LONG|XMLTYPE)/.test(t)) return 0; // not indexable as B-Tree
  return 8;
}

const NON_COLUMN_START =
  /^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|PARTITION|SUBPARTITION|SUPPLEMENTAL|USING|LOB|PERIOD)\b/i;

/** Split a column list on commas that sit at bracket depth zero. */
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

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

export interface ParseOutcome {
  table: ParsedTable | null;
  error: string | null;
  skipped: string[];
}

export function parseCreateTable(sql: string): ParseOutcome {
  const cleaned = stripComments(sql);
  const header = cleaned.match(
    /CREATE\s+(?:GLOBAL\s+TEMPORARY\s+|PRIVATE\s+TEMPORARY\s+)?TABLE\s+("?[\w$#]+"?)(?:\s*\.\s*("?[\w$#]+"?))?\s*\(/i,
  );
  if (!header) {
    return {
      table: null,
      error: "No CREATE TABLE statement found. Paste the full statement including the column list.",
      skipped: [],
    };
  }

  const open = cleaned.indexOf("(", header.index! + header[0].length - 1);
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
  if (close === -1) {
    return { table: null, error: "The column list is not closed — a ')' is missing.", skipped: [] };
  }

  const unquote = (s?: string) => s?.replace(/"/g, "").trim();
  const schema = header[2] ? unquote(header[1]) : undefined;
  const name = unquote(header[2] ?? header[1])!;

  const columns: ParsedColumn[] = [];
  const skipped: string[] = [];

  for (const raw of splitTopLevel(cleaned.slice(open + 1, close))) {
    const part = raw.trim().replace(/\s+/g, " ");
    if (!part || NON_COLUMN_START.test(part)) continue;

    const m = part.match(/^("?[\w$#]+"?)\s+([\w ]+(?:\(\s*\d+(?:\s*,\s*\d+)?\s*(?:BYTE|CHAR)?\s*\))?)/i);
    if (!m) continue;

    const colName = unquote(m[1])!;
    const dataType = m[2].trim().toUpperCase();
    const avgLength = inferAvgLength(dataType);

    if (avgLength === 0) {
      skipped.push(`${colName} (${dataType}) — LOB and LONG columns cannot be B-Tree indexed.`);
      continue;
    }
    columns.push({
      name: colName,
      dataType,
      avgLength,
      nullable: !/NOT\s+NULL/i.test(part),
    });
  }

  if (columns.length === 0) {
    return { table: null, error: "The statement parsed, but no indexable columns were found.", skipped };
  }
  return { table: { schema, name, columns }, error: null, skipped };
}
