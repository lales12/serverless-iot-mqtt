# Serverless offline Mqtt and iot plugin

This [Serverless](https://github.com/serverless/serverless) plugin allow develop in local machines and connect to MQTT service.

This plugin require a MQTT service running in order to trigger the defined events

Features
 - Handle functions with iot events.
 - Compatible with MQTT service.


 ## Example

 ```yml
provider:
  name: aws
  runtime: nodejs16.x
  region: us-east-1

functions:
  event_handler:
    handler: ${HANDLER_PATH}
    events:
      - iot:
          name: EVENT_NAME
          description: EVENT_DESCRIPTION
          sql: "SELECT * FROM 'EVENT_TOPIC'"
          sqlVersion: beta

custom:
  serverless-iot:
    mqttUrl: 'mqtt://localhost:1883'
    debug: true
 ```