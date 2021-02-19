// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// index.js is used to setup and configure your bot

// Import required packages
const path = require('path');
const WebSocket = require('ws');

// Note: Ensure you have a .env file and include the MicrosoftAppId and MicrosoftAppPassword.
const ENV_FILE = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_FILE });

const restify = require('restify');

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
const { BotFrameworkAdapter, CardFactory, ActionTypes, MessageFactory, ConsoleTranscriptLogger, TeamsInfo } = require('botbuilder');

// This bot's main dialog.
const { ProactiveBot } = require('./bots/proactiveBot');

// Create adapter.
// See https://aka.ms/about-bot-adapter to learn more about adapters.
const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});

// Catch-all for errors.
adapter.onTurnError = async(context, error) => {
    // This check writes out errors to console log .vs. app insights.
    // NOTE: In production environment, you should consider logging this to Azure
    //       application insights. See https://aka.ms/bottelemetry for telemetry
    //       configuration instructions.
    console.error(`\n [onTurnError] unhandled error: ${ error }`);

    // Send a trace activity, which will be displayed in Bot Framework Emulator
    await context.sendTraceActivity(
        'OnTurnError Trace',
        `${ error }`,
        'https://www.botframework.com/schemas/error',
        'TurnError'
    );

    // Send a message to the user
    await context.sendActivity('The bot encountered an error or bug.');
    await context.sendActivity('To continue to run this bot, please fix the bot source code.');
};

// Create the main dialog.
const conversationReferences = {};
const bot = new ProactiveBot(conversationReferences);

// Create HTTP server.
const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function() {
    console.log(`\n${ server.name } listening to ${ server.url }`);
    console.log('\nGet Bot Framework Emulator: https://aka.ms/botframework-emulator');
    console.log('\nTo talk to your bot, open the emulator select "Open Bot"');
});

// Listen for incoming activities and route them to your bot main dialog.
server.post('/api/messages', (req, res) => {
    adapter.processActivity(req, res, async(turnContext) => {
        // route to main dialog.
        await bot.run(turnContext);
    });
});

// Listen for incoming notifications and send proactive messages to users.
server.get('/api/notify', async(req, res) => {

    console.log('notify incoming');
    console.log(conversationReferences);
    console.log(bot.conversationReferences);

    for (const conversationReference of Object.values(bot.conversationReferences)) {
        await adapter.continueConversation(conversationReference, async turnContext => {
            // If you encounter permission-related errors when sending this message, see
            // https://aka.ms/BotTrustServiceUrl
            await turnContext.sendActivity('proactive hello');
        });
    }


    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.write('<html><body><h1>Proactive messages have been sent.</h1></body></html>');
    res.end();
});

// get connection to help sensor and post all messagees
console.log("Opening WebSocket connection to sensor ...");
let socket = new WebSocket("ws://192.168.188.33:8080");

// message received - show the message in div#messages
socket.onmessage = function(event) {
    const data = JSON.parse(event.data);
    if (data.event === "result") {
        sendStuff('Da hat wieder einer Hilfe geschrien!');
    }
}

async function sendStuff(message) {
    for (const conversationReference of Object.values(bot.conversationReferences)) {
        await adapter.continueConversation(conversationReference, async turnContext => {
            await turnContext.sendActivity(message);
        });
    }
};

async function sendMoreStuff(message) {
    for (const conversationReference of Object.values(bot.conversationReferences)) {
        await adapter.continueConversation(conversationReference, async turnContext => {

            const value = { count: 0 };
            const card = CardFactory.heroCard(
                'Neuer Alarm von Sensor XY updates!',
                null, [{
                    type: ActionTypes.MessageBack,
                    title: 'Annehmen',
                    value: value,
                    text: 'Annehmen'
                }, {
                    type: ActionTypes.MessageBack,
                    title: 'Erledigt',
                    value: value,
                    text: 'Erledigt'
                }]);

            bums = MessageFactory.attachment(card);

            // dings = await turnContext.sendActivity(bums);
            // console.log('Nachrichtenantwortsdings:');
            // console.log(dings);

            const newActivity = MessageFactory.text('The new text for the activity');
            // bums.id = '1612525533661';
            // await turnContext.updateActivity(bums);
            turnContext.sendActivity(newActivity);

        });
    }
};


//
// MQTT Zeugs
//
///////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////
var mqtt = require('mqtt');
const { type } = require('os');
const options = {
    clientId: "RO-bot",
    username: "p0int0megA",
    password: "hm49DG275$wPkd7B",
    clean: true,
    rejectUnauthorized: false
};
const event_topic = 'pointomega/redone/srv';
const mod_all_topic = 'pointomega/redone/mod/all';

const url = "mqtts://raw.pointomega.de:48883"
var client = mqtt.connect(url, options)

client.on("error", function(error) {
    console.log("Can't connect" + error);
    process.exit(1)
});
client.subscribe(mod_all_topic, { qos: 1 });
client.subscribe(event_topic, { qos: 1 });

client.on('message', function(topic, message, packet) {
    console.log(`${topic}: ${message}`);
    if (message.e_name === "ALARM") {

    }
});

client.on("connect", function() {
    console.log("connected  " + client.connected);
})

var message_options = {
    retain: true,
    qos: 1
};
const registration_message = {
    "e_type": "IND",
    "e_name": "Register",
    "e_from": "pointomega/redone/mod/RO-Bot",
    "e_id": 1,
    "m_name": "RO-Bot",
    "m_role": "1"
};
// register the bot with RedOne
client.publish(event_topic, JSON.stringify(registration_message), message_options)
client.subscribe('pointomega/redone/mod/RO-Bot', { qos: 1 });