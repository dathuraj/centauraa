import json
import boto3
import os
from datetime import datetime

# Initialize AWS clients
ecs = boto3.client('ecs')
logs = boto3.client('logs')

# Environment variables
CLUSTER_NAME = os.environ['ECS_CLUSTER_NAME']
SERVICE_NAME = os.environ['ECS_SERVICE_NAME']
LOG_GROUP = os.environ.get('LOG_GROUP', '/aws/lambda/restart-ecs-service')

def lambda_handler(event, context):
    """
    Lambda function to restart ECS service when prompts are updated in S3.
    Triggered by S3 object PUT events.
    """

    print(f"Event received: {json.dumps(event)}")

    try:
        # Extract S3 event details
        for record in event['Records']:
            event_name = record['eventName']
            bucket_name = record['s3']['bucket']['name']
            object_key = record['s3']['object']['key']

            print(f"S3 Event: {event_name}")
            print(f"Bucket: {bucket_name}")
            print(f"Object: {object_key}")

            # Only process PUT events (new uploads or updates)
            if not event_name.startswith('ObjectCreated:'):
                print(f"Ignoring event type: {event_name}")
                continue

            # Restart ECS service by forcing new deployment
            print(f"Restarting ECS service: {SERVICE_NAME} in cluster: {CLUSTER_NAME}")

            response = ecs.update_service(
                cluster=CLUSTER_NAME,
                service=SERVICE_NAME,
                forceNewDeployment=True
            )

            print(f"Service update initiated successfully")
            print(f"Service ARN: {response['service']['serviceArn']}")
            print(f"Deployment ID: {response['service']['deployments'][0]['id']}")
            print(f"Desired count: {response['service']['desiredCount']}")

            # Log the update
            log_message = {
                'timestamp': datetime.utcnow().isoformat(),
                'event': 'ECS_SERVICE_RESTART',
                'reason': 'Prompts updated in S3',
                'bucket': bucket_name,
                'object_key': object_key,
                'cluster': CLUSTER_NAME,
                'service': SERVICE_NAME,
                'deployment_id': response['service']['deployments'][0]['id']
            }

            print(f"Update completed: {json.dumps(log_message)}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'ECS service restart initiated successfully',
                'cluster': CLUSTER_NAME,
                'service': SERVICE_NAME
            })
        }

    except Exception as e:
        error_message = f"Error restarting ECS service: {str(e)}"
        print(error_message)

        # Still return 200 to avoid S3 retries, but log the error
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Error occurred',
                'error': str(e)
            })
        }
