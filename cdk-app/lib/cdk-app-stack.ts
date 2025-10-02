import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';

export class CdkAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const suffix = '1759435915570';

    // S3 bucket for product images
    const imagesBucket = new s3.Bucket(this, `ProductImagesBucket${suffix}`, {
      bucketName: `product-images-${suffix}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // DynamoDB table for product specifications
    const specsTable = new dynamodb.Table(this, `ProductSpecsTable${suffix}`, {
      tableName: `product-specifications-${suffix}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // IAM role for Lambda function
    const lambdaRole = new iam.Role(this, `OcrProcessorRole${suffix}`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add permissions for S3, DynamoDB, and Bedrock
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: [imagesBucket.arnForObjects('*')],
    }));

    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem', 'dynamodb:UpdateItem'],
      resources: [specsTable.tableArn],
    }));

    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [
        'arn:aws:bedrock:*:*:inference-profile/global.anthropic.claude-sonnet-4-20250514-v1:0',
        'arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-20250514-v1:0'
      ],
    }));

    // Lambda function for OCR processing
    const ocrProcessor = new lambda.Function(this, `OcrProcessorFunction${suffix}`, {
      functionName: `product-ocr-processor-${suffix}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      role: lambdaRole,
      environment: {
        BEDROCK_MODEL_ID: 'global.anthropic.claude-sonnet-4-20250514-v1:0',
        DYNAMODB_TABLE_NAME: `product-specifications-${suffix}`,
      },
    });

    // Add S3 event notification to trigger Lambda
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(ocrProcessor),
      { suffix: '.jpg' }
    );

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(ocrProcessor),
      { suffix: '.jpeg' }
    );

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(ocrProcessor),
      { suffix: '.png' }
    );

    // Outputs
    new cdk.CfnOutput(this, 'ImagesBucketName', {
      value: imagesBucket.bucketName,
      description: 'S3 bucket for product images',
    });

    new cdk.CfnOutput(this, 'SpecsTableName', {
      value: specsTable.tableName,
      description: 'DynamoDB table for product specifications',
    });

    new cdk.CfnOutput(this, 'ProcessorFunctionName', {
      value: ocrProcessor.functionName,
      description: 'Lambda function for OCR processing',
    });
  }
}
