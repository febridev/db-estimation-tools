import { describe, expect, it } from "vitest";
import { blockOverhead, entrySize, estimate, rowidLength } from "../sizing";
import { inferAvgLength, parseCreateTable } from "../ddl-parser";
import type { EstimatorInput } from "../types";

const base: EstimatorInput = {
  blockSize: 8192,
  totalRows: 10_000_000,
  columns: [
    { name: "STATUS_CODE", dataType: "VARCHAR2(2)", avgLength: 2, ndv: 6 },
    { name: "ORDER_DATE", dataType: "DATE", avgLength: 7, ndv: 1800 },
  ],
  pctFree: 10,
  initTrans: 2,
  unique: false,
  structure: "NORMAL",
  partitionScope: "NONE",
  compressPrefix: 0,
  splitOverheadPct: 5,
  parallelDegree: 1,
  online: false,
  extentSizeBytes: 1024 * 1024,
  tablespaceName: "IDX",
  indexName: "IX_T_01",
  tableName: "T",
  availableTempGb: 50,
  availableUndoGb: 10,
  concurrentDmlPerHour: 0,
  undoBytesPerDml: 400,
  buildMinutes: 30,
};

describe("block overhead", () => {
  it("matches the legacy 160-byte figure at INITRANS 2", () => {
    expect(blockOverhead(2)).toBe(161);
  });
  it("grows with INITRANS", () => {
    expect(blockOverhead(10)).toBeGreaterThan(blockOverhead(2));
  });
});

describe("entry size", () => {
  it("charges 10 bytes of ROWID for a global index", () => {
    expect(rowidLength("GLOBAL")).toBe(10);
    expect(rowidLength("LOCAL")).toBe(6);
  });
  it("is smaller for a unique index than a non-unique one", () => {
    const u = entrySize(base.columns, "NONE", true);
    const n = entrySize(base.columns, "NONE", false);
    expect(u).toBeLessThan(n);
  });
});

describe("compression", () => {
  it("shrinks the entry when the prefix repeats often", () => {
    const plain = estimate(base);
    const compressed = estimate({ ...base, compressPrefix: 1 });
    expect(compressed.effectiveEntrySize).toBeLessThan(plain.effectiveEntrySize);
    expect(compressed.estimatedGb).toBeLessThan(plain.estimatedGb);
  });

  it("warns when the prefix is nearly unique", () => {
    const unique = estimate({
      ...base,
      columns: [{ name: "ID", dataType: "NUMBER", avgLength: 6, ndv: base.totalRows }, base.columns[1]],
      compressPrefix: 1,
    });
    expect(unique.warnings.join(" ")).toMatch(/enlarges this index/);
  });
});

describe("risk", () => {
  it("reports no undo pressure for an offline build", () => {
    expect(estimate(base).undo.requiredGb).toBe(0);
  });

  it("sizes undo from concurrent DML for an online build", () => {
    const r = estimate({ ...base, online: true, concurrentDmlPerHour: 1_000_000, buildMinutes: 60 });
    expect(r.undo.requiredGb).toBeGreaterThan(0);
    expect(r.undo.level).toBe("SAFE");
  });

  it("flags temp as critical when free space is short", () => {
    const r = estimate({ ...base, availableTempGb: 0.1 });
    expect(r.temp.level).toBe("CRITICAL");
  });
});

describe("ddl parser", () => {
  const sql = `CREATE TABLE sales.order_line (
    order_id NUMBER(12) NOT NULL,
    sku VARCHAR2(32),
    note CLOB,
    created_at TIMESTAMP(6),
    CONSTRAINT pk_ol PRIMARY KEY (order_id)
  );`;

  it("reads schema, table and indexable columns", () => {
    const { table, skipped } = parseCreateTable(sql);
    expect(table?.schema).toBe("sales");
    expect(table?.name).toBe("order_line");
    expect(table?.columns.map((c) => c.name)).toEqual(["order_id", "sku", "created_at"]);
    expect(skipped).toHaveLength(1);
  });

  it("infers stored widths per datatype", () => {
    expect(inferAvgLength("DATE")).toBe(7);
    expect(inferAvgLength("VARCHAR2(32)")).toBe(16);
    expect(inferAvgLength("CHAR(4)")).toBe(4);
  });

  it("reports a clear error for input without a CREATE TABLE", () => {
    expect(parseCreateTable("select 1 from dual").error).toMatch(/No CREATE TABLE/);
  });
});

describe("derivation", () => {
  it("shows one step per stage and never contradicts the engine", async () => {
    const { buildDerivation } = await import("../explain");
    const r = estimate(base);
    const steps = buildDerivation(base, r);
    const ids = steps.map((s) => s.id);
    expect(ids).toContain("ubs");
    expect(ids).toContain("entry");
    expect(ids).toContain("leaf");
    expect(ids).toContain("temp");
    // The entry step must quote exactly what the engine computed.
    expect(steps.find((s) => s.id === "entry")!.value).toContain(r.entrySize.toFixed(1));
  });

  it("adds a compression step only when COMPRESS is on", async () => {
    const { buildDerivation } = await import("../explain");
    const off = buildDerivation(base, estimate(base)).map((s) => s.id);
    const on = buildDerivation(
      { ...base, compressPrefix: 1 },
      estimate({ ...base, compressPrefix: 1 }),
    ).map((s) => s.id);
    expect(off).not.toContain("compress");
    expect(on).toContain("compress");
  });
});
