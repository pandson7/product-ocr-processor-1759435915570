# Design Document

## Architecture Overview

The Product OCR Processor system implements a serverless event-driven architecture on AWS that automatically processes uploaded product images to extract specifications using AI-powered OCR capabilities.

## System Components

### Core Services
- **Amazon S3**: Primary storage for product images with event notifications
- **AWS Lambda**: Serverless compute for image processing logic
- **Amazon Bedrock**: AI service providing Claude model for OCR and text extraction
- **Amazon DynamoDB**: NoSQL database for flexible product specification storage
- **AWS IAM**: Identity and access management for secure service interactions

### Architecture Flow
1. Product image uploaded to S3 bucket
2. S3 event notification triggers Lambda function
3. Lambda function retrieves image from S3
4. Lambda invokes Bedrock Claude model for OCR processing
5. Claude model analyzes image and returns product specifications in JSON
6. Lambda parses response and stores structured data in DynamoDB
7. Processing completion logged for audit trail

## Technical Architecture

### S3 Bucket Configuration
- **Bucket Name**: `product-images-{suffix}`
- **Event Configuration**: Object creation events trigger Lambda
- **Security**: Private bucket with IAM-based access control
- **Versioning**: Enabled for data protection

### Lambda Function Design
- **Runtime**: Python 3.11
- **Memory**: 1024 MB (sufficient for image processing)
- **Timeout**: 5 minutes (adequate for Bedrock API calls)
- **Environment Variables**: 
  - `BEDROCK_MODEL_ID`: `global.anthropic.claude-sonnet-4-20250514-v1:0`
  - `DYNAMODB_TABLE_NAME`: `product-specifications-{suffix}`

### Bedrock Integration
- **Model**: Claude Sonnet 4 (global.anthropic.claude-sonnet-4-20250514-v1:0)
- **Input**: Base64 encoded image with structured prompt
- **Output**: JSON formatted product specifications
- **Error Handling**: Retry logic for transient failures

### DynamoDB Schema
```json
{
  "id": "string (UUID)",
  "imageKey": "string (S3 object key)",
  "processedAt": "string (ISO timestamp)",
  "productSpecs": {
    "productName": "string",
    "brand": "string",
    "specifications": "object (flexible structure)"
  },
  "processingStatus": "string (SUCCESS|FAILED|PROCESSING)",
  "errorMessage": "string (optional)"
}
```

## Security Design

### IAM Roles and Policies
- **Lambda Execution Role**: 
  - S3 read access to images bucket
  - DynamoDB read/write access to specifications table
  - Bedrock invoke access for Claude model
  - CloudWatch Logs write access

### Data Security
- All data in transit encrypted using TLS
- S3 bucket encryption at rest
- DynamoDB encryption at rest
- No hardcoded credentials in code

## Error Handling Strategy

### Retry Logic
- Bedrock API calls: 3 retries with exponential backoff
- DynamoDB operations: Built-in AWS SDK retry logic
- S3 operations: Built-in AWS SDK retry logic

### Failure Scenarios
- Invalid image format: Log error, update status in DynamoDB
- Bedrock service unavailable: Retry with backoff, eventual failure logging
- JSON parsing errors: Log raw response, attempt graceful degradation
- DynamoDB write failures: Log error, attempt retry

## Performance Considerations

### Scalability
- Lambda automatically scales based on S3 event volume
- DynamoDB on-demand pricing for variable workloads
- S3 handles unlimited storage capacity

### Optimization
- Lambda function warmed through reserved concurrency if needed
- Image size validation to prevent oversized processing
- Efficient JSON parsing with error boundaries

## Monitoring and Logging

### CloudWatch Integration
- Lambda function logs for debugging
- Custom metrics for processing success/failure rates
- S3 access logs for audit trail
- DynamoDB metrics for performance monitoring

### Alerting
- CloudWatch alarms for high error rates
- SNS notifications for critical failures (optional enhancement)
