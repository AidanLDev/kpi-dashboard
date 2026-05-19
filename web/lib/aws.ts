import {
  TimestreamQueryClient,
  QueryCommand,
  type ColumnInfo,
  type Row,
} from "@aws-sdk/client-timestream-query";

const client = new TimestreamQueryClient({ region: "eu-west-1" });

export interface UserActivityRow {
  userId: string;
}

function parseRows(columns: ColumnInfo[], rows: Row[]): UserActivityRow[] {
  return rows.map((row) =>
    Object.fromEntries(
      (row.Data ?? []).map((cell, i) => [
        columns[i]?.Name ?? `col_${i}`,
        cell.NullValue ? null : (cell.ScalarValue ?? null),
      ]),
    ) as unknown as UserActivityRow,
  );
}

export async function getTimestreamData(): Promise<UserActivityRow[]> {
  const result = await client.send(
    new QueryCommand({
      QueryString: `
        SELECT userId
        FROM "LineVuPortalUserActivityDatabase-prod"."UserActivity-prod"
        WHERE time between ago(7d) and now()
        AND userId NOT IN (
          '21325aa3-0f70-44a6-a1bf-64a2a985103e',
          'b77d46dc-a7e7-4bb8-988b-ef0400886bbe',
          '476c4eaa-aebd-47b8-a27b-fd488b0ec3e5',
          '04a3b2d9-3c82-4e7a-8c1e-e34df6b8e705',
          '580923fa-d2b3-406e-81c8-caf82908ddc4',
          'd63a8b0d-9537-4da9-8013-168d5dd62f2b',
          '03480208-e174-476e-bf58-c944cd6f148d',
          '53d18c7b-7b22-4a0a-bfc8-40c2c4f07249',
          '95ad99aa-a40d-449d-858d-06757089ad2a',
          '97eca1a6-250c-4983-a87a-c1c7c3e32f42',
          '6670c70b-86cd-4d73-97db-1c1f84572468',
          'a76489e3-694a-4ca9-a551-fccee8dbccf1',
          '31887517-7e51-4574-97ce-f63cad1d45e2',
          '4c8d80d1-bcc4-4912-873d-b18846d99fe7',
          '439cc064-dde2-400a-b3ba-2d7a40a31ec3',
          '9c43e7f9-2c2c-4084-8b82-34b4aa9b2a65',
          '0ba6ba01-0626-4894-83f9-8885184ee2dc'
        )
        GROUP BY userId
      `,
    }),
  );

  return parseRows(result.ColumnInfo ?? [], result.Rows ?? []);
}
