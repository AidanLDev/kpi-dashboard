import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as timestream from "aws-cdk-lib/aws-timestream";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as path from "path";

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

    timestreamDb.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    const timestreamTable = new timestream.CfnTable(this, "KpiMetricsTable", {
      databaseName: "KpiDashboardDatabase",
      tableName: "KpiMetrics",
      retentionProperties: {
        memoryStoreRetentionPeriodInHours: (24 * 31).toString(),
        magneticStoreRetentionPeriodInDays: (365 * 5).toString(),
      },
      magneticStoreWriteProperties: {
        enableMagneticStoreWrites: true,
      },
    });

    timestreamTable.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    timestreamTable.node.addDependency(timestreamDb);

    const timestreamGroup = new iam.CfnGroup(this, "TimestreamAccessGroup", {
      groupName: "TimestreamAccessGroup",
      policies: [
        {
          policyName: "TimestreamAccess",
          policyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: [
                  "timestream:UpdateTable",
                  "timestream:WriteRecords",
                  "timestream:DescribeEndpoints",
                ],
                Resource: timestreamTable.attrArn,
              },
            ],
          },
        },
      ],
    });

    new iam.CfnUserToGroupAddition(this, "AidanTimestreamGroupMembership", {
      groupName: timestreamGroup.ref,
      users: ["aidan.lowson"],
    });

    const ingestFn = new lambda.Function(this, "IngestDailyMetrics", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda/ingestDailyMetrics")),
      handler: "index.handler",
      timeout: cdk.Duration.minutes(2),
      environment: {
        GA_PROPERTY_ID: process.env.GA_PROPERTY_ID ?? "",
        GA_CLIENT_EMAIL: process.env.GA_CLIENT_EMAIL ?? "",
        GA_PRIVATE_KEY: process.env.GA_PRIVATE_KEY ?? "",
        SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN ?? "",
        SENTRY_ORG: process.env.SENTRY_ORG ?? "process-vision",
        SENTRY_PROJECT: process.env.SENTRY_PROJECT ?? "linevu-portal",
        TIMESTREAM_DATABASE: "KpiDashboardDatabase",
        TIMESTREAM_TABLE: "KpiMetrics",
      },
    });

    ingestFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["timestream:WriteRecords"],
        resources: [timestreamTable.attrArn],
      }),
    );

    // DescribeEndpoints is account-level, not resource-scoped
    ingestFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["timestream:DescribeEndpoints"],
        resources: ["*"],
      }),
    );

    new events.Rule(this, "IngestDailySchedule", {
      schedule: events.Schedule.cron({ hour: "1", minute: "0" }),
      targets: [new targets.LambdaFunction(ingestFn)],
    });
  }
}
