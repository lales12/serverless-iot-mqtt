import {Lambda} from 'aws-sdk';
import { connect, MqttClient } from 'mqtt';
import {Buffer} from 'buffer';
import Serverless from 'serverless';
import Service from 'serverless/classes/Service';

export interface ServerlessIotMqttOptions {
    mqttUrl?: string;
    lambdaUrl?: string;
    debug?: boolean;
    enabled?: boolean;
}

interface MappedFunctionsInterface {
    [key: string]: string;
}

class ServerlessIotMqtt {
    static DEFAULT_MQTT_URL = 'mqtt://localhost:1883';
    static DEFAULT_LAMBDA_URL = 'http://localhost:3002';
    static CAPTURE_TOPIC_REGEX = /SELECT .+ FROM [\'\"](.+)[\'\"]$/;

    private serverless: Serverless;
    private service: Service;
    private customOptions: ServerlessIotMqttOptions;
    private mappedFunctions: MappedFunctionsInterface;
    private mqttClient?: MqttClient;
    private lambda?: Lambda;
    private functions?: any;
    public hooks: any;

    constructor(serverless: Serverless) {
        this.serverless = serverless;
        this.service = serverless.service;
        this.customOptions = {};
        this.mappedFunctions = {};

        this.hooks = {
            'offline:start:init': () => this.init(),
        };
    }

    init() {
        console.log('-------------------Serverless IoT Plugin-------------------');
        if (!this.customOptions.enabled) {
            console.log('- Plugin disabled');
            return;
        }

        this.functions = this.service.functions;
        this.customOptions = this.serverless.service.custom['serverless-iot'];

        this.lambda = new Lambda({
            apiVersion: '2015-03-31',
            endpoint: this.customOptions.lambdaUrl || ServerlessIotMqtt.DEFAULT_LAMBDA_URL,
            region: this.serverless.service.provider.region,
        });

        this.mqttClient = connect(this.customOptions.mqttUrl || ServerlessIotMqtt.DEFAULT_MQTT_URL);

        this.mqttClient.on('connect', this.__onConnect.bind(this));
        this.mqttClient.on('error', this.__onError.bind(this));
        this.mqttClient.on('message', this.__onMessage.bind(this));
    }

    __onConnect() {
        console.log('Connected to MQTT broker');
        this.__registerIotEvents();
    }

    __onError(error: Error) {
        console.log('Error connecting to MQTT broker');
        console.log(error);
    }

    __registerIotEvents() {
        for (const functionName in this.functions) {
            for (const event of this.functions[functionName].events) {
                if (event.iot) {
                    this.__registerEventSql(event.iot.sql, functionName);
                }
            }
        }
    }

    __registerEventSql(sql: string, functionName: string) {
        const captureGroup = sql.match(ServerlessIotMqtt.CAPTURE_TOPIC_REGEX);

        if (captureGroup && captureGroup[1]) {
            this.mappedFunctions[captureGroup[1]] = functionName;
            this.mqttClient?.subscribe(captureGroup[1], (error) => {
                if (error) {
                    console.log('Error subscribing to topic', captureGroup[1]);
                    console.log(error);
                    return;
                }
                console.log('Subscribed to topic', sql);
            });
        }
    }

    __onMessage(topic: string, message: any) {
        if (this.customOptions.debug) {
            console.log('Received message on topic', topic);
            console.log('Message', message.toString());
        }

        for (const registeredTopic in this.mappedFunctions) {
            const topicRegexp = this.__getTopicRegex(registeredTopic);

            if (topicRegexp.test(topic)) {
                const callback = this.service.getFunction(this.mappedFunctions[registeredTopic]);

                this.invokeLambda(callback.name, {topic}, message.toString());
            }
        }
    }

    __getTopicRegex(topic: string) {
        return new RegExp(topic.replace(/\/\+/g, '/[^/]+').replace(/\+/g, '[^/]+'));
    }

    async invokeLambda(lambdaFunctionName: string, context: any, payload: any) {
        const params = {
            ClientContext: Buffer.from(JSON.stringify(context)).toString('base64'),
            FunctionName: lambdaFunctionName,
            InvocationType: 'Event',
            Payload: payload,
        };

        const response = await this.lambda?.invoke(params).promise();

        return {
            body: JSON.stringify(response),
            statusCode: 200,
        };
    }
}

module.exports = ServerlessIotMqtt;