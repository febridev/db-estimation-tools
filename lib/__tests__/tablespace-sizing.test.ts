import { describe, expect, it } from "vitest";
import {
  blockOverhead,
  usableBlockSpace,
  rowOverhead,
  calculateDefaultAvgRowLength,
  calculateDefaultRowsPerBlock,
  calculateCapacityPlan,
} from "../tablespace-sizing";
import { parseCapacityDdl } from "../capacity-ddl-parser";
import type { CapacityInput, CapacityTable } from "../tablespace-types";

describe("Tablespace Sizing & Capacity Planning", () => {
  describe("Block and row overhead calculations", () => {
    it("computes block overhead correctly", () => {
      // 113 B fixed header + 24 B per INITRANS slot
      // INITRANS 2 -> 113 + 48 = 161 B
      expect(blockOverhead(2)).toBe(161);
      // INITRANS 1 -> 113 + 24 = 137 B
      expect(blockOverhead(1)).toBe(137);
    });

    it("computes usable block space accounting for PCTFREE", () => {
      // Block size 8192, overhead 161 -> remaining 8031
      // PCTFREE 10% -> 8031 * 0.9 = 7227.9
      const usable = usableBlockSpace(8192, 10, 2);
      expect(Math.round(usable)).toBe(7228);
    });

    it("computes row overhead based on column count", () => {
      // 3 B header + 1 B per column length indicator
      expect(rowOverhead(10)).toBe(13);
      expect(rowOverhead(5)).toBe(8);
    });

    it("calculates default average row length from columns", () => {
      const columns = [
        { avgLength: 10 },
        { avgLength: 20 },
        { avgLength: 30 },
      ];
      const result = calculateDefaultAvgRowLength(columns);
      // 10 + 20 + 30 = 60 B column data + (3 + 3) = 66 B
      expect(result.columnBytes).toBe(60);
      expect(result.overheadBytes).toBe(6);
      expect(result.totalBytes).toBe(66);
    });

    it("calculates default rows per block accurately", () => {
      // 8192 block, 10% PCTFREE, INITRANS 2 -> usable ~7227.9 B
      // avgRowLength 100 -> floor(7227.9 / 100) = 72 rows/block
      const res = calculateDefaultRowsPerBlock(8192, 10, 2, 100);
      expect(res.rowsPerBlock).toBe(72);
    });
  });

  describe("DDL parsing and capacity plan calculations", () => {
    const SAMPLE_DDL = `
      CREATE TABLE sales.orders (
        order_id     NUMBER(12)   NOT NULL,
        customer_id  NUMBER(10)   NOT NULL,
        order_date   DATE         NOT NULL,
        status       VARCHAR2(20) NOT NULL,
        total_amount NUMBER(15,2),
        CONSTRAINT pk_orders PRIMARY KEY (order_id)
      );
      CREATE INDEX idx_orders_cust ON sales.orders (customer_id);
    `;

    const baseInput: CapacityInput = {
      blockSize: 8192,
      pctFree: 10,
      initTrans: 2,
      bufferPct: 10,
      retentionDays: 180,
      rowsPerDay: 100_000,
      totalRows: 0,
      extentSizeBytes: 1024 * 1024,
      parallelDegree: 4,
      undoBytesPerRow: 400,
      bulkBatchSize: 50_000,
    };

    it("parses table and index correctly", () => {
      const outcome = parseCapacityDdl(SAMPLE_DDL);
      expect(outcome.error).toBeNull();
      expect(outcome.tables).toHaveLength(1);
      const table = outcome.tables[0];
      expect(table.name).toBe("orders");
      expect(table.schema).toBe("sales");
      expect(table.columns).toHaveLength(5);
      // PK creates implicit index + 1 explicit index = 2 indexes
      expect(table.indexes).toHaveLength(2);
    });

    it("calculates capacity plan with default DDL row length and rows per block", () => {
      const outcome = parseCapacityDdl(SAMPLE_DDL);
      const plan = calculateCapacityPlan(outcome.tables, baseInput);

      expect(plan.tables).toHaveLength(1);
      const tableResult = plan.tables[0];
      expect(tableResult.totalRowsOverRetention).toBe(180 * 100_000); // 18,000,000 rows
      expect(tableResult.avgRowLength).toBeGreaterThan(0);
      expect(tableResult.rowsPerBlock).toBeGreaterThan(0);
      expect(tableResult.totalBlocks).toBe(
        Math.ceil(18_000_000 / tableResult.rowsPerBlock),
      );
      expect(tableResult.allocatedGb).toBeGreaterThan(0);

      // Indexes are sized
      expect(plan.indexes).toHaveLength(2);
      expect(plan.totalIndexGb).toBeGreaterThan(0);

      // TEMP and UNDO are estimated
      expect(plan.temp.requiredGb).toBeGreaterThan(0);
      expect(plan.undo.requiredGb).toBeGreaterThan(0);
    });

    it("respects user override for average row length", () => {
      const outcome = parseCapacityDdl(SAMPLE_DDL);
      const customRowLen = 250;

      const overriddenInput: CapacityInput = {
        ...baseInput,
        tableOverrides: {
          "sales.orders": {
            avgRowLength: customRowLen,
          },
        },
      };

      const plan = calculateCapacityPlan(outcome.tables, overriddenInput);
      const tableResult = plan.tables[0];

      expect(tableResult.avgRowLength).toBe(customRowLen);
      expect(tableResult.isCustomRowLength).toBe(true);
      // Rows per block should be computed from the custom row length
      const expectedRows = Math.floor(tableResult.usableBlockSpace / customRowLen);
      expect(tableResult.rowsPerBlock).toBe(expectedRows);
    });

    it("respects user override for rows per block", () => {
      const outcome = parseCapacityDdl(SAMPLE_DDL);
      const customRowsPerBlock = 50;

      const overriddenInput: CapacityInput = {
        ...baseInput,
        tableOverrides: {
          "sales.orders": {
            rowsPerBlock: customRowsPerBlock,
          },
        },
      };

      const plan = calculateCapacityPlan(outcome.tables, overriddenInput);
      const tableResult = plan.tables[0];

      expect(tableResult.rowsPerBlock).toBe(customRowsPerBlock);
      expect(tableResult.isCustomRowsPerBlock).toBe(true);
      expect(tableResult.totalBlocks).toBe(Math.ceil(18_000_000 / customRowsPerBlock));
    });

    it("applies 10% buffer correctly to allocated tablespace", () => {
      const outcome = parseCapacityDdl(SAMPLE_DDL);
      const planNoBuffer = calculateCapacityPlan(outcome.tables, {
        ...baseInput,
        bufferPct: 0,
      });
      const planWithBuffer = calculateCapacityPlan(outcome.tables, {
        ...baseInput,
        bufferPct: 10,
      });

      // Allocated bytes with buffer should be greater than or equal to without buffer
      expect(planWithBuffer.tables[0].allocatedBytes).toBeGreaterThanOrEqual(
        planNoBuffer.tables[0].allocatedBytes,
      );
    });

    it("calculates data, index, TEMP, and UNDO when retention is 0 for one-time bulk load / migration", () => {
      const outcome = parseCapacityDdl(SAMPLE_DDL);
      const oneTimeBulkRows = 2_500_000;

      const bulkOnlyInput: CapacityInput = {
        ...baseInput,
        retentionDays: 0,
        rowsPerDay: 0,
        bulkRows: oneTimeBulkRows,
      };

      const plan = calculateCapacityPlan(outcome.tables, bulkOnlyInput);
      const tableResult = plan.tables[0];

      // Rows sized should match one-time bulk rows exactly
      expect(tableResult.bulkRows).toBe(oneTimeBulkRows);
      expect(tableResult.retentionRows).toBe(0);
      expect(tableResult.totalRowsOverRetention).toBe(oneTimeBulkRows);

      // Data tablespace must be sized for 2.5 million rows
      expect(tableResult.totalBlocks).toBe(
        Math.ceil(oneTimeBulkRows / tableResult.rowsPerBlock),
      );
      expect(tableResult.allocatedGb).toBeGreaterThan(0);

      // Indexes must be sized for 2.5 million rows
      expect(plan.indexes).toHaveLength(2);
      expect(plan.indexes[0].totalRows).toBe(oneTimeBulkRows);
      expect(plan.totalIndexGb).toBeGreaterThan(0);

      // Grand total should be sum of data and index
      expect(plan.grandTotalGb).toBeCloseTo(
        plan.totalDataGb + plan.totalIndexGb,
        5,
      );

      // TEMP must be calculated for sorting 2.5 million rows
      expect(plan.temp.requiredGb).toBeGreaterThan(0);
      expect(plan.temp.detail).toContain("2,500,000");

      // UNDO must be calculated for bulk batch size
      expect(plan.undo.requiredGb).toBeGreaterThan(0);

      // There should not be a warning about empty rows
      expect(plan.warnings).not.toContain(
        "Both bulk incoming rows and daily retention rows are 0 — please specify row count in Bulk Load or Data Volume.",
      );
    });

    it("supports per-table bulk rows override for multi-table migration", () => {
      const outcome = parseCapacityDdl(SAMPLE_DDL);
      const tableSpecificBulkRows = 5_000_000;

      const inputWithTableOverride: CapacityInput = {
        ...baseInput,
        retentionDays: 0,
        rowsPerDay: 0,
        bulkRows: 100_000, // global fallback
        tableOverrides: {
          "sales.orders": {
            bulkRows: tableSpecificBulkRows,
          },
        },
      };

      const plan = calculateCapacityPlan(outcome.tables, inputWithTableOverride);
      const tableResult = plan.tables[0];

      expect(tableResult.bulkRows).toBe(tableSpecificBulkRows);
      expect(tableResult.totalRowsOverRetention).toBe(tableSpecificBulkRows);
      expect(tableResult.totalBlocks).toBe(
        Math.ceil(tableSpecificBulkRows / tableResult.rowsPerBlock),
      );
    });
  });
});
