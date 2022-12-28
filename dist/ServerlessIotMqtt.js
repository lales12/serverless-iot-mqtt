"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const aws_sdk_1 = require("aws-sdk");
const mqtt_1 = require("mqtt");
const buffer_1 = require("buffer");
class ServerlessIotMqtt {
    constructor(serverless) {
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
        this.lambda = new aws_sdk_1.Lambda({
            apiVersion: '2015-03-31',
            endpoint: this.customOptions.lambdaUrl || ServerlessIotMqtt.DEFAULT_LAMBDA_URL,
            region: this.serverless.service.provider.region,
        });
        this.mqttClient = (0, mqtt_1.connect)(this.customOptions.mqttUrl || ServerlessIotMqtt.DEFAULT_MQTT_URL);
        this.mqttClient.on('connect', this.__onConnect.bind(this));
        this.mqttClient.on('error', this.__onError.bind(this));
        this.mqttClient.on('message', this.__onMessage.bind(this));
    }
    __onConnect() {
        console.log('Connected to MQTT broker');
        this.__registerIotEvents();
    }
    __onError(error) {
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
    __registerEventSql(sql, functionName) {
        var _a;
        const captureGroup = sql.match(ServerlessIotMqtt.CAPTURE_TOPIC_REGEX);
        if (captureGroup && captureGroup[1]) {
            this.mappedFunctions[captureGroup[1]] = functionName;
            (_a = this.mqttClient) === null || _a === void 0 ? void 0 : _a.subscribe(captureGroup[1], (error) => {
                if (error) {
                    console.log('Error subscribing to topic', captureGroup[1]);
                    console.log(error);
                    return;
                }
                console.log('Subscribed to topic', sql);
            });
        }
    }
    __onMessage(topic, message) {
        if (this.customOptions.debug) {
            console.log('Received message on topic', topic);
            console.log('Message', message.toString());
        }
        for (const registeredTopic in this.mappedFunctions) {
            const topicRegexp = this.__getTopicRegex(registeredTopic);
            if (topicRegexp.test(topic)) {
                const callback = this.service.getFunction(this.mappedFunctions[registeredTopic]);
                this.invokeLambda(callback.name, { topic }, message.toString());
            }
        }
    }
    __getTopicRegex(topic) {
        return new RegExp(topic.replace(/\/\+/g, '/[^/]+').replace(/\+/g, '[^/]+'));
    }
    invokeLambda(lambdaFunctionName, context, payload) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                ClientContext: buffer_1.Buffer.from(JSON.stringify(context)).toString('base64'),
                FunctionName: lambdaFunctionName,
                InvocationType: 'Event',
                Payload: payload,
            };
            const response = yield ((_a = this.lambda) === null || _a === void 0 ? void 0 : _a.invoke(params).promise());
            return {
                body: JSON.stringify(response),
                statusCode: 200,
            };
        });
    }
}
ServerlessIotMqtt.DEFAULT_MQTT_URL = 'mqtt://localhost:1883';
ServerlessIotMqtt.DEFAULT_LAMBDA_URL = 'http://localhost:3002';
ServerlessIotMqtt.CAPTURE_TOPIC_REGEX = /SELECT .+ FROM [\'\"](.+)[\'\"]$/;
module.exports = ServerlessIotMqtt;
