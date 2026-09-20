"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldRow, Input, Select, Toggle } from "@/components/ui/field";
import type { EstimatorInput } from "@/lib/types";

interface Props {
  value: EstimatorInput;
  onChange: (patch: Partial<EstimatorInput>) => void;
}

export function Parameters({ value, onChange }: Props) {
  const maxPrefix = Math.max(0, value.columns.length - (value.unique ? 1 : 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle>3 · Storage and build options</CardTitle>
        <CardDescription>
          Everything here changes the estimate, the risk verdict, or the generated DDL.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <FieldRow label="Block size" hint="Must match DB_BLOCK_SIZE of the target tablespace.">
          <Select
            value={value.blockSize}
            onChange={(e) => onChange({ blockSize: Number(e.target.value) as EstimatorInput["blockSize"] })}
          >
            {[2048, 4096, 8192, 16384, 32768].map((b) => (
              <option key={b} value={b}>
                {b / 1024} KB
              </option>
            ))}
          </Select>
        </FieldRow>

        <FieldRow label="Rows in the table">
          <Input
            type="number"
            min={1}
            className="numeric"
            value={value.totalRows}
            onChange={(e) => onChange({ totalRows: Number(e.target.value) })}
          />
        </FieldRow>

        <FieldRow label="PCTFREE (%)" hint="Reserved per leaf block. Keep 10 for a static index, raise it when the key grows in the middle.">
          <Input
            type="number"
            min={0}
            max={99}
            className="numeric"
            value={value.pctFree}
            onChange={(e) => onChange({ pctFree: Number(e.target.value) })}
          />
        </FieldRow>

        <FieldRow label="INITRANS" hint="Each slot costs 24 bytes of every block, so this shifts the estimate.">
          <Input
            type="number"
            min={1}
            max={255}
            className="numeric"
            value={value.initTrans}
            onChange={(e) => onChange({ initTrans: Number(e.target.value) })}
          />
        </FieldRow>

        <FieldRow label="Partitioning" hint="A global index carries a 10-byte extended ROWID instead of 6.">
          <Select
            value={value.partitionScope}
            onChange={(e) =>
              onChange({ partitionScope: e.target.value as EstimatorInput["partitionScope"] })
            }
          >
            <option value="NONE">Non-partitioned table</option>
            <option value="LOCAL">Local partitioned index</option>
            <option value="GLOBAL">Global partitioned index</option>
          </Select>
        </FieldRow>

        <FieldRow label="Structure">
          <Select
            value={value.structure}
            onChange={(e) => onChange({ structure: e.target.value as EstimatorInput["structure"] })}
          >
            <option value="NORMAL">B-Tree</option>
            <option value="REVERSE">Reverse key</option>
          </Select>
        </FieldRow>

        <FieldRow
          label="COMPRESS prefix columns"
          hint={`0 turns compression off. At most ${maxPrefix} here.`}
        >
          <Input
            type="number"
            min={0}
            max={maxPrefix}
            className="numeric"
            value={value.compressPrefix}
            onChange={(e) => onChange({ compressPrefix: Number(e.target.value) })}
          />
        </FieldRow>

        <FieldRow label="Block split slack (%)" hint="5 for a fresh build. Raise toward 25 if the index will grow by random DML.">
          <Input
            type="number"
            min={0}
            max={50}
            className="numeric"
            value={value.splitOverheadPct}
            onChange={(e) => onChange({ splitOverheadPct: Number(e.target.value) })}
          />
        </FieldRow>

        <FieldRow label="Parallel degree">
          <Input
            type="number"
            min={1}
            max={128}
            className="numeric"
            value={value.parallelDegree}
            onChange={(e) => onChange({ parallelDegree: Number(e.target.value) })}
          />
        </FieldRow>

        <FieldRow label="Extent granularity" hint="The segment is rounded up to whole extents.">
          <Select
            value={value.extentSizeBytes}
            onChange={(e) => onChange({ extentSizeBytes: Number(e.target.value) })}
          >
            <option value={64 * 1024}>64 KB</option>
            <option value={1024 * 1024}>1 MB (autoallocate)</option>
            <option value={8 * 1024 * 1024}>8 MB</option>
            <option value={64 * 1024 * 1024}>64 MB</option>
          </Select>
        </FieldRow>

        <FieldRow label="Index name">
          <Input value={value.indexName} onChange={(e) => onChange({ indexName: e.target.value })} />
        </FieldRow>

        <FieldRow label="Target tablespace">
          <Input
            value={value.tablespaceName}
            onChange={(e) => onChange({ tablespaceName: e.target.value })}
          />
        </FieldRow>

        <div className="sm:col-span-2 grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Unique index"
            hint="A unique key stores the ROWID outside the key and saves a byte per row."
            checked={value.unique}
            onCheckedChange={(unique) => onChange({ unique })}
          />
          <Toggle
            label="Build ONLINE"
            hint="Keeps DML running, and is the only case where this build is exposed to UNDO limits."
            checked={value.online}
            onCheckedChange={(online) => onChange({ online })}
          />
        </div>

        <FieldRow label="Free TEMP (GB)">
          <Input
            type="number"
            min={0}
            step="0.1"
            className="numeric"
            value={value.availableTempGb}
            onChange={(e) => onChange({ availableTempGb: Number(e.target.value) })}
          />
        </FieldRow>

        <FieldRow label="Free UNDO (GB)">
          <Input
            type="number"
            min={0}
            step="0.1"
            className="numeric"
            value={value.availableUndoGb}
            onChange={(e) => onChange({ availableUndoGb: Number(e.target.value) })}
          />
        </FieldRow>

        {value.online ? (
          <>
            <FieldRow label="Expected build time (minutes)">
              <Input
                type="number"
                min={1}
                className="numeric"
                value={value.buildMinutes}
                onChange={(e) => onChange({ buildMinutes: Number(e.target.value) })}
              />
            </FieldRow>
            <FieldRow label="Concurrent DML (rows/hour)" hint="Rows other sessions change on this table while the build runs.">
              <Input
                type="number"
                min={0}
                className="numeric"
                value={value.concurrentDmlPerHour}
                onChange={(e) => onChange({ concurrentDmlPerHour: Number(e.target.value) })}
              />
            </FieldRow>
            <FieldRow label="Undo per changed row (bytes)" hint="Around 300-500 for a narrow row; measure with V$TRANSACTION.USED_UBLK.">
              <Input
                type="number"
                min={1}
                className="numeric"
                value={value.undoBytesPerDml}
                onChange={(e) => onChange({ undoBytesPerDml: Number(e.target.value) })}
              />
            </FieldRow>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
