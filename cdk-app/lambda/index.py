import json
import boto3
import base64
import uuid
from datetime import datetime
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')
bedrock_client = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')

def handler(event, context):
    try:
        # Parse S3 event
        for record in event['Records']:
            bucket_name = record['s3']['bucket']['name']
            object_key = record['s3']['object']['key']
            
            logger.info(f"Processing image: {object_key} from bucket: {bucket_name}")
            
            # Get image from S3
            response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
            image_content = response['Body'].read()
            
            # Encode image to base64
            image_base64 = base64.b64encode(image_content).decode('utf-8')
            
            # Prepare Bedrock request
            prompt = """
            Analyze this product image and extract the following information in JSON format:
            - productName: The name of the product
            - brand: The brand or manufacturer
            - specifications: Any other visible product details (ingredients, nutritional info, etc.)
            
            Return only valid JSON without any markdown formatting or code blocks.
            """
            
            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": image_base64
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            }
            
            # Call Bedrock
            bedrock_response = bedrock_client.invoke_model(
                modelId='global.anthropic.claude-sonnet-4-20250514-v1:0',
                body=json.dumps(request_body)
            )
            
            response_body = json.loads(bedrock_response['body'].read())
            extracted_text = response_body['content'][0]['text']
            
            # Parse JSON from response (handle markdown-wrapped JSON)
            try:
                # Remove markdown code blocks if present
                if '```json' in extracted_text:
                    extracted_text = extracted_text.split('```json')[1].split('```')[0]
                elif '```' in extracted_text:
                    extracted_text = extracted_text.split('```')[1].split('```')[0]
                
                product_specs = json.loads(extracted_text.strip())
            except json.JSONDecodeError:
                logger.error(f"Failed to parse JSON: {extracted_text}")
                product_specs = {"error": "Failed to parse product specifications"}
            
            # Store in DynamoDB
            table = dynamodb.Table('product-specifications-1759435915570')
            item = {
                'id': str(uuid.uuid4()),
                'imageKey': object_key,
                'processedAt': datetime.utcnow().isoformat(),
                'productSpecs': product_specs,
                'processingStatus': 'SUCCESS'
            }
            
            table.put_item(Item=item)
            logger.info(f"Successfully processed and stored specs for {object_key}")
            
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        # Store error in DynamoDB
        try:
            table = dynamodb.Table('product-specifications-1759435915570')
            error_item = {
                'id': str(uuid.uuid4()),
                'imageKey': object_key if 'object_key' in locals() else 'unknown',
                'processedAt': datetime.utcnow().isoformat(),
                'processingStatus': 'FAILED',
                'errorMessage': str(e)
            }
            table.put_item(Item=error_item)
        except:
            pass
        raise e
    
    return {
        'statusCode': 200,
        'body': json.dumps('Processing completed')
    }
