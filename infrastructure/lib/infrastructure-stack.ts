import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as timestream from "aws-cdk-lib/aws-timestream";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const timestreamDb = new timestream.CfnDatabase(
      this,
      "KpiDashboardDatabase",
      {
        databaseName: "KpiDashboardDatabase",
      },
    );

    // Retain database if stack is deleted
    timestreamDb.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    const timestreamTable = new timestream.CfnTable(this, "KpiMetricsTable", {
      databaseName: "KpiDashboardDatabase",
      tableName: "KpiMetrics",
      retentionProperties: {
        memoryStoreRetentionPeriodInHours: (24 * 31).toString(),
        magneticStoreRetentionPeriodInDays: (365 * 5).toString(),
      },
    });

    // Retain table if stack is deleted
    timestreamTable.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    timestreamTable.node.addDependency(timestreamDb);
  }
}
