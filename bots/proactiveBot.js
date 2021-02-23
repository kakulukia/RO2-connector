// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { BotFrameworkAdapter, ActivityHandler, TurnContext, ConsoleTranscriptLogger, CardFactory, ActionTypes, TeamsInfo, MessageFactory, ActivityFactory } = require('botbuilder');
const ACData = require("adaptivecards-templating");
var AdaptiveCards = require("adaptivecards");

const fs = require('fs');
const path = require('path');
// Note: Ensure you have a .env file and include the MicrosoftAppId and MicrosoftAppPassword.
const ENV_FILE = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_FILE });

const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});

const redis = require("redis");
const redisClient = redis.createClient();

redisClient.on("error", function(error) {
    console.error(error);
});

class ProactiveBot extends ActivityHandler {
    constructor(conversationReferences) {
        super();

        this.appId = process.env.MicrosoftAppId;
        console.log(this.appId);

        this.conversationReferences = JSON.parse(fs.readFileSync('channelReference.json', 'utf-8').toString());

        console.log('init:');
        console.log(Object.keys(this.conversationReferences));

        this.onConversationUpdate(async(context, next) => {
            this.updateConversationReference(context.activity);

            console.log('Converesation update!');

            await next();
        });

        this.onMembersAdded(async(context, next) => {
            const membersAdded = context.activity.membersAdded;

            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

        this.onTurn = async(turnContext) => {

            // turnContext.onSendActivities(async(ctx, activities, nextSend) => {
            //     activities.forEach(async(activity) => {
            //         if (activity.channelData.saveMe) {
            //             this.savedActivity = activity;
            //         }
            console.log('turning ..');
            //     });
            //     return await nextSend();
            // });
        };

        this.onMessage(async(context, next) => {

            let message = context.activity.text || context.activity.value.text

            const activity = context.activity;
            switch (message.replace(/<.*>/i, '').trim()) {
                case 'add':
                    await this.addConversation(context);
                    break;
                case 'remove':
                    await this.removeConversation(context);
                    break;
                case 'list':
                    await this.sendStatusCard(context)
                    break;
                case 'Annehmen':
                    redisClient.get(context.activity.value.id, async(err, reply) => {
                        let alarmData = JSON.parse(reply);
                        var template = new ACData.Template(JSON.parse(fs.readFileSync('alarmTemplate.json', 'utf-8').toString()));

                        alarmData.status = `in Bearbeitung (${activity.from.name})`
                        alarmData.started = new Date().toISOString()
                        alarmData.user = activity.from.name
                        var card = template.expand({
                            $root: alarmData
                        });
                        await adapter.continueConversation(this.conversationReferences[alarmData.target], async turnContext => {

                            await turnContext.updateActivity({
                                attachments: [CardFactory.adaptiveCard(card)],
                                id: alarmData.activityID,
                                type: "message"
                            });
                            // console.log(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
                        })
                        redisClient.set(alarmData.id, JSON.stringify(alarmData));
                    });
                    break;
                case 'Erledigt':
                    redisClient.get(context.activity.value.id, async(err, reply) => {
                        let alarmData = JSON.parse(reply);
                        var template = new ACData.Template(JSON.parse(fs.readFileSync('alarmTemplateDone.json', 'utf-8').toString()));

                        alarmData.status = `Erledigt`
                        alarmData.user = activity.from.name
                        alarmData.done = new Date().toISOString()
                        var card = template.expand({
                            $root: alarmData
                        });
                        await adapter.continueConversation(this.conversationReferences[alarmData.target], async turnContext => {

                            await turnContext.updateActivity({
                                attachments: [CardFactory.adaptiveCard(card)],
                                id: alarmData.activityID,
                                type: "message"
                            });
                            // console.log(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
                        })
                        redisClient.set(alarmData.id, JSON.stringify(alarmData));
                        console.log(alarmData);
                    });
                    break;
                default:
                    // By default for unknown activity sent by user show
                    // a card with the available actions.
                    const value = { count: 0 };
                    const card = CardFactory.heroCard(
                        'Mögliche Befehle',
                        null, [{
                            type: ActionTypes.MessageBack,
                            title: 'Registrierte Kanäle anzeigen (list)',
                            value: value,
                            text: 'list'
                        }, {
                            type: ActionTypes.MessageBack,
                            title: 'Kanal hinzufügen (add)',
                            value: value,
                            text: 'add'
                        }, {
                            type: ActionTypes.MessageBack,
                            title: 'Kanal entfernen (remove)',
                            value: value,
                            text: 'remove'
                        }]);
                    await context.sendActivity({ attachments: [card] });
                    break;
            }

            // await context.sendActivity(`You sent '${ context.activity.text }'`);
            await next();
        });
    }

    updateConversationReference(activity) {

        //check if its related to the bot?
        console.log("Conversation update..");

        const conversationReference = TurnContext.getConversationReference(activity);
        if (activity.membersAdded === undefined && activity.membersRemoved === undefined) return;

        if (activity.membersAdded && activity.membersAdded[0].id.includes(this.appId)) {
            this.conversationReferences[conversationReference.conversation.id] = conversationReference;
        }
        if (activity.membersRemoved && activity.membersRemoved[0].id.includes(this.appId)) {
            delete this.conversationReferences[conversationReference.conversation.id];
        }
        this.saveConversations();
    }

    async addConversation(context) {

        const conversationReference = TurnContext.getConversationReference(context.activity);

        // remove any message referrance and only store the channel
        conversationReference.conversation.id = conversationReference.conversation.id.replace(/;messag.*/, '');


        if (this.conversationReferences[conversationReference.conversation.id]) {
            await context.sendActivity(`Dieser Kanal ist bereits registriert. (${conversationReference.conversation.id})`);
        } else {
            await context.sendActivity(`${conversationReference.conversation.id} hinzugefügt`);
        }
        this.conversationReferences[conversationReference.conversation.id] = conversationReference;

        this.saveConversations();
    }

    async removeConversation(context) {
        const conversationReference = TurnContext.getConversationReference(context.activity);
        conversationReference.conversation.id = conversationReference.conversation.id.replace(/;messag.*/, '');


        if (this.conversationReferences[conversationReference.conversation.id]) {
            await context.sendActivity(`${conversationReference.conversation.id} wurde gelöscht`);
        } else {
            await context.sendActivity(`Dieser Kanal ist nicht registriert. (${conversationReference.conversation.id})`);
        }
        delete this.conversationReferences[conversationReference.conversation.id];

        this.saveConversations();
    }

    saveConversations() {
        const data = JSON.stringify(this.conversationReferences);
        fs.writeFile('channelReference.json', data, (err) => {
            if (err) {
                throw err;
            }
        });
        console.log(Object.keys(this.conversationReferences));
    }

    async sendStatusCard(context) {
        let facts = []

        var channels = await TeamsInfo.getTeamChannels(context);
        var teamInfo = await TeamsInfo.getTeamDetails(context);
        channels.forEach(channel => {
            if (this.conversationReferences[channel.id] != undefined) {
                facts.push({ name: channel.name || 'Allgemein', id: channel.id })
            }
        });

        var template = new ACData.Template({
            // Card Template JSON

            "type": "AdaptiveCard",
            "body": [{
                    "type": "TextBlock",
                    "size": "Medium",
                    "weight": "Bolder",
                    "text": `RO-Bot Kanalübersicht für Team ${teamInfo.name}`
                },
                {
                    "type": "TextBlock",
                    "text": "Aktuell sind die folgenden Kanäle registriert und als Alarm-Target verfügbar.",
                    "wrap": true
                },
                {
                    "type": "Container",
                    "items": [{
                        "type": "ColumnSet",
                        "$data": facts,
                        "columns": [{
                                "type": "Column",
                                "width": "100px",
                                "separator": true,
                                "items": [{
                                    "type": "TextBlock",
                                    "wrap": true,
                                    "text": "${name}:",
                                    "weight": "Bolder"
                                }]
                            },
                            {
                                "type": "Column",
                                "width": "stretch",
                                "items": [{
                                    "type": "TextBlock",
                                    "text": "${id}",
                                    "wrap": true
                                }]
                            }
                        ]
                    }]
                },
                {
                    "type": "ActionSet",
                    "actions": [{
                            "type": "Action.Submit",
                            "title": "Diesen Kanal hinzufügen",
                            "style": "positive",
                            "data": { "text": "add" }
                        },
                        {
                            "type": "Action.Submit",
                            "title": "Diesen Kanal entfernen",
                            "style": "destructive",
                            "data": { "text": "remove" }
                        }
                    ]
                }
            ],
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "version": "1.3"
        });
        var card = template.expand({
            $root: {
                facts
            }
        });

        await context.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] })
    }
}

module.exports.ProactiveBot = ProactiveBot;