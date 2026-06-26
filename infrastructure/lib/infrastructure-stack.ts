import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as timestream from "aws-cdk-lib/aws-timestream";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigwv2Authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as path from "path";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Timestream ──────────────────────────────────────────────────────────

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

    // ── Ingest Lambda (existing) ─────────────────────────────────────────────

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

    // ── API Lambda functions ─────────────────────────────────────────────────

    const apiLockFile = path.join(__dirname, "../../api/pnpm-lock.yaml");

    const sentryFn = new lambdaNode.NodejsFunction(this, "SentryApiHandler", {
      entry: path.join(__dirname, "../../api/handlers/sentry.ts"),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      depsLockFilePath: apiLockFile,
      bundling: { forceDockerBundling: false },
      environment: {
        SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN ?? "",
        SENTRY_ORG: process.env.SENTRY_ORG ?? "process-vision",
        SENTRY_PROJECT: process.env.SENTRY_PROJECT ?? "linevu-portal",
      },
    });

    const timestreamApiFn = new lambdaNode.NodejsFunction(this, "TimestreamApiHandler", {
      entry: path.join(__dirname, "../../api/handlers/timestream.ts"),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      depsLockFilePath: apiLockFile,
      bundling: { forceDockerBundling: false },
    });

    timestreamApiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["timestream:Select", "timestream:DescribeEndpoints"],
        resources: ["*"],
      }),
    );

    const gaFn = new lambdaNode.NodejsFunction(this, "GaApiHandler", {
      entry: path.join(__dirname, "../../api/handlers/ga.ts"),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      depsLockFilePath: apiLockFile,
      bundling: { forceDockerBundling: false },
      environment: {
        GA_PROPERTY_ID: process.env.GA_PROPERTY_ID ?? "",
        GA_CLIENT_EMAIL: process.env.GA_CLIENT_EMAIL ?? "",
        GA_PRIVATE_KEY: process.env.GA_PRIVATE_KEY ?? "",
      },
    });

    // ── HTTP API Gateway + Cognito JWT authorizer ────────────────────────────

    const jwtAuthorizer = new apigwv2Authorizers.HttpJwtAuthorizer(
      "CognitoAuthorizer",
      "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_61gIHVu8G",
      {
        jwtAudience: ["6r0ttidjbo73f48ol67gqr5iv2"],
      },
    );

    const httpApi = new apigwv2.HttpApi(this, "KpiApi", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ["Authorization", "Content-Type"],
      },
    });

    const routes: Array<[string, lambda.IFunction]> = [
      ["/sentry", sentryFn],
      ["/timestream", timestreamApiFn],
      ["/ga", gaFn],
    ];

    for (const [routePath, fn] of routes) {
      httpApi.addRoutes({
        path: routePath,
        methods: [apigwv2.HttpMethod.GET],
        integration: new apigwv2Integrations.HttpLambdaIntegration(
          `${routePath.slice(1)}Integration`,
          fn,
        ),
        authorizer: jwtAuthorizer,
      });
    }

    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });

    // ── S3 + CloudFront for static frontend ─────────────────────────────────

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, "ProcessVisionZone", {
      hostedZoneId: "Z0225832HPW4RBQ3WKJF",
      zoneName: "processvision.com",
    });

    // ACM certificate must be in us-east-1 for CloudFront.
    // DnsValidatedCertificate is the correct API in CDK 2.145.0 for cross-region certs.
    const certificate = new acm.DnsValidatedCertificate(this, "KpiCertificate", {
      domainName: "kpis.processvision.com",
      hostedZone,
      region: "us-east-1",
    });

    const siteBucket = new s3.Bucket(this, "KpiDashboardSite", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "KpiDistribution", {
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      domainNames: ["kpis.processvision.com"],
      certificate,
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
    });

    new route53.ARecord(this, "KpiAliasRecord", {
      zone: hostedZone,
      recordName: "kpis",
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
    });

    new cdk.CfnOutput(this, "CloudFrontUrl", { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "DashboardUrl", { value: "https://kpis.processvision.com" });
  }
}
