// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const {
  BotFrameworkAdapter,
  ActivityHandler,
  TurnContext,
  CardFactory,
  ActionTypes,
  TeamsInfo,
} = require("botbuilder");
const ACData = require("adaptivecards-templating");
var AdaptiveCards = require("adaptivecards");

const fs = require("fs");
const path = require("path");
// Note: Ensure you have a .env file and include the MicrosoftAppId and MicrosoftAppPassword.
const ENV_FILE = path.join(__dirname, ".env");
require("dotenv").config({ path: ENV_FILE });

const adapter = new BotFrameworkAdapter({
  appId: process.env.MicrosoftAppId,
  appPassword: process.env.MicrosoftAppPassword,
});

const redis = require("redis");
const redisClient = redis.createClient();

redisClient.on("error", function (error) {
  console.error(error);
});

function choose(choices) {
  var index = Math.floor(Math.random() * choices.length);
  return choices[index];
}

//
// MQTT Zeugs
//
///////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////
var mqtt = require("mqtt");
const { type } = require("os");
const botName = "RO-bot"
const options = {
  clientId: botName,
  username: "p0int0megA",
  password: "hm49DG275$wPkd7B",
  clean: true,
  rejectUnauthorized: false,
};
const srvTopic = "pointomega/redone/srv";
const botTopic = "pointomega/redone/mod/RO-Bot";
const url = "mqtts://raw.pointomega.de:48883";
var mqttClient = mqtt.connect(url, options);

mqttClient.on("error", function (error) {
  console.log("Can't connect" + error);
  process.exit(1);
});
mqttClient.subscribe(srvTopic, { qos: 1 });
mqttClient.subscribe(botTopic, { qos: 1 });

mqttClient.on("connect", function () {
  console.log("Connected to RedOne ..");
});

// register the bot with RedOne
// using a timeout since otherwise the subscription is to slow to catch the confirmation message :)
setTimeout(function () {
  postMessage({
    e_type: "IND",
    e_name: "Register",
    m_role: "1"
  });
}, 500);



class ProactiveBot extends ActivityHandler {
  constructor() {
    super();

    this.appId = process.env.MicrosoftAppId;

    this.conversationReferences = JSON.parse(
      fs.readFileSync("channelReference.json", "utf-8").toString()
    );
    this.channels = JSON.parse(
      fs.readFileSync("channels.json", "utf-8").toString()
    );

    mqttClient.on("message", (topic, message, packet) => {
      console.log(`${topic}: ${message}`);
      if (topic === botTopic) {
        message = JSON.parse(message.toString());
        if (message.e_type === "REQ" && message.e_name === "Notify") {
          if (Object.entries(this.conversationReferences).length === 0) {
            console.log("Keine channel registriert!");
          } else {
            message.target = choose(Object.keys(this.conversationReferences));
            this.sendAlarm(message);
          }
        }
      }
    });

    console.log("init:");
    console.log(Object.keys(this.conversationReferences));
    console.log(this.channels);

    this.onConversationUpdate(async (context, next) => {
      this.updateConversationReference(context);
      await next();
    });

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;

      // By calling next() you ensure that the next BotHandler is run.
      await next();
    });

    this.onMessage(async (context, next) => {
      let message = context.activity.text || context.activity.value.text;

      const activity = context.activity;
      switch (message.replace(/<.*>/i, "").trim()) {
        case "add":
          await this.addConversation(context);
          break;
        case "remove":
          await this.removeConversation(context);
          break;
        case "list":
          await this.sendStatusCard(context);
          break;
        case "Annehmen":
          redisClient.get(context.activity.value.id, async (err, reply) => {
            let alarmData = JSON.parse(reply);
            var template = new ACData.Template(
              JSON.parse(
                fs.readFileSync("alarmTemplate.json", "utf-8").toString()
              )
            );

            alarmData.started = new Date().toISOString();
            var currentUser = activity.from;
            currentUser.date = new Date().toISOString();

            const found = alarmData.users.find(
              (user) => user.id === currentUser.id
            );
            if (found) {
              await adapter.continueConversation(
                this.conversationReferences[alarmData.target],
                async (turnContext) => {
                  await turnContext.sendActivity(
                    "Du hast den Alarm bereits angenommen."
                  );
                }
              );
              return;
            }

            alarmData.users.push(currentUser);

            const names = alarmData.users
              .map(function (user) {
                return user.name;
              })
              .join(", ");
            alarmData.status = `in Bearbeitung (${names})`;

            var card = template.expand({
              $root: alarmData,
            });
            await adapter.continueConversation(
              this.conversationReferences[alarmData.target],
              async (turnContext) => {
                await turnContext.updateActivity({
                  attachments: [CardFactory.adaptiveCard(card)],
                  id: alarmData.activityID,
                  type: "message",
                });
              }
            );
            redisClient.set(alarmData.id, JSON.stringify(alarmData));

            // send accept message to RedOne
            postMessage({
              e_type: "IND",
              e_name: "Accept",
              a_id: alarmData.id,
              t_id: alarmData.targetId,
              t_code: "0",
            });
          });
          break;
        case "Erledigt":
          redisClient.get(context.activity.value.id, async (err, reply) => {
            let alarmData = JSON.parse(reply);
            var template = new ACData.Template(
              JSON.parse(
                fs.readFileSync("alarmTemplateDone.json", "utf-8").toString()
              )
            );

            alarmData.status = "Done";
            alarmData.done = new Date().toISOString();

            var currentUser = activity.from;
            const found = alarmData.users.find(
              (user) => user.id === currentUser.id
            );
            if (!found) {
              alarmData.users.push(activity.from);
            }

            const names = alarmData.users
              .map(function (user) {
                return user.name;
              })
              .join(", ");
            alarmData.names = names;

            var card = template.expand({
              $root: alarmData,
            });
            await adapter.continueConversation(
              this.conversationReferences[alarmData.target],
              async (turnContext) => {
                await turnContext.updateActivity({
                  attachments: [CardFactory.adaptiveCard(card)],
                  id: alarmData.activityID,
                  type: "message",
                });
              }
            );
            redisClient.set(alarmData.id, JSON.stringify(alarmData));

            // send confirmation to RedOne
            postMessage({
              e_type: "IND",
              e_name: "Done",
              a_id: alarmData.id,
              t_id: alarmData.targetId,
              e_cause: 0,
            });
          });
          break;
        default:
          // By default for unknown activity sent by user show
          // a card with the available actions.
          const value = { count: 0 };
          const card = CardFactory.heroCard("Mögliche Befehle", null, [
            {
              type: ActionTypes.MessageBack,
              title: "Registrierte Kanäle anzeigen (list)",
              value: value,
              text: "list",
            },
            {
              type: ActionTypes.MessageBack,
              title: "Kanal hinzufügen (add)",
              value: value,
              text: "add",
            },
            {
              type: ActionTypes.MessageBack,
              title: "Kanal entfernen (remove)",
              value: value,
              text: "remove",
            },
          ]);
          await context.sendActivity({ attachments: [card] });
          break;
      }

      // await context.sendActivity(`You sent '${ context.activity.text }'`);
      await next();
    });
  }

  async updateConversationReference(context) {
    const activity = context.activity;
    var teamName = activity.channelData.team.name;

    if (!teamName) {
      teamName = (await TeamsInfo.getTeamDetails(context)).name;
    }

    // wee need to do it differently, since the team data is deleted / hidden from the bot
    if (activity.channelData.eventType === "teamDeleted") {
      for (const channelId of Object.keys(
        this.channels[activity.channelData.team.name]
      )) {
        delete this.conversationReferences[channelId];
      }
      delete this.channels[teamName];
      this.saveConversations();
      this.saveChannels();
      return;
    }
    if (activity.channelData.eventType === "teamMemberRemoved") {
      if (activity.membersRemoved[0].id.includes(this.appId)) {
        for (var channelId of Object.keys(
          this.channels[teamName]
        )) {
          delete this.conversationReferences[channelId];
        }
        delete this.channels[activity.channelData.team.name];
      }
      this.saveConversations();
      this.saveChannels();
      return;
    }

    const conversationReference = TurnContext.getConversationReference(
      activity
    );

    switch (activity.channelData.eventType) {
      case "teamRenamed":
        // ids stay the same but wee need to update the team name in channels
        // lets use the current teams channels to see which of those are registered
        var teamChannels = await TeamsInfo.getTeamChannels(context);
        var oldTeamName = undefined;

        teamChannels.every((channel) => {
          if (oldTeamName) return false;

          Object.keys(this.channels).forEach((currentTeamName) => {
            if (oldTeamName) return;

            var currentChannels = this.channels[currentTeamName];
            Object.keys(currentChannels).forEach((currrentChannelId) => {
              console.log('3');
              console.log(currrentChannelId);
              if (channel.id === currrentChannelId) {
                oldTeamName = currentTeamName;
                console.log('MATCH');
                console.log(currentTeamName);
                return;
              }
            })
          })
        })

        this.channels[teamName] = this.channels[oldTeamName];
        delete this.channels[oldTeamName];
        break;

      case "channelRenamed":
        if (!this.channels[teamName]) {
          this.channels[teamName] = {};
        }
        this.channels[teamName][activity.channelData.channel.id] =
          activity.channelData.channel.name;
        break;

      case "teamMemberAdded":
        if (activity.membersAdded[0].id.includes(this.appId)) {
          this.conversationReferences[
            conversationReference.conversation.id
          ] = conversationReference;
        }

        this.channels[teamName] = {};
        this.channels[teamName][activity.channelData.team.id] =
          "Allgemein";
        break;

      case "channelDeleted":
        if (!this.channels[teamName]) {
          return;
        }
        delete this.channels[teamName][activity.channelData.channel.id];
        delete this.conversationReferences[activity.channelData.channel.id];
        break;
    }
    this.saveConversations();
    this.saveChannels();
  }

  async addConversation(context) {
    const conversationReference = TurnContext.getConversationReference(
      context.activity
    );

    // remove any message referrance and only store the channel
    conversationReference.conversation.id = conversationReference.conversation.id.replace(
      /;messag.*/,
      ""
    );

    if (this.conversationReferences[conversationReference.conversation.id]) {
      await context.sendActivity(
        `Dieser Kanal ist bereits registriert. (${conversationReference.conversation.id})`
      );
    } else {
      await context.sendActivity(
        `${conversationReference.conversation.id} hinzugefügt`
      );
    }
    this.conversationReferences[
      conversationReference.conversation.id
    ] = conversationReference;

    // also add to internal channels list
    var teamInfo = await TeamsInfo.getTeamDetails(context);
    var teamChannels = await TeamsInfo.getTeamChannels(context);

    if (!this.channels[teamInfo.name]) {
      this.channels[teamInfo.name] = {};
    }

    teamChannels.forEach((channel) => {
      if (channel.id === context.activity.channelData.channel.id) {
        this.channels[teamInfo.name][channel.id] = channel.name || "Allgemein";
      }
    });

    this.saveConversations();
    this.saveChannels();
  }

  async removeConversation(context) {
    const conversationReference = TurnContext.getConversationReference(
      context.activity
    );
    conversationReference.conversation.id = conversationReference.conversation.id.replace(
      /;messag.*/,
      ""
    );

    if (this.conversationReferences[conversationReference.conversation.id]) {
      await context.sendActivity(
        `${conversationReference.conversation.id} wurde gelöscht`
      );
    } else {
      await context.sendActivity(
        `Dieser Kanal ist nicht registriert. (${conversationReference.conversation.id})`
      );
    }
    delete this.conversationReferences[conversationReference.conversation.id];

    // also delete from channels list
    for (const team of Object.keys(this.channels)) {
      delete this.channels[team][conversationReference.conversation.id];
    }

    this.saveConversations();
    this.saveChannels();
  }

  saveConversations() {
    const data = JSON.stringify(this.conversationReferences);
    fs.writeFile("channelReference.json", data, (err) => {
      if (err) {
        throw err;
      }
    });
    // console.log(Object.keys(this.conversationReferences));
  }
  saveChannels() {
    const data = JSON.stringify(this.channels);
    fs.writeFile("channels.json", data, (err) => {
      if (err) {
        throw err;
      }
    });
    console.log(this.channels);
  }

  async sendStatusCard(context) {
    let facts = [];

    for (const teamName of Object.keys(this.channels)) {
      for (const channelId of Object.keys(this.channels[teamName])) {
        {
          facts.push({
            name: this.channels[teamName][channelId] || "Allgemein",
            id: channelId,
            team: teamName,
          });
        }
      }
    }

    var message = "Aktuell sind die folgenden Kanäle als Alarm-Target verfügbar."
    if (facts.length === 0) message = "Es sind noch keine Kanäle als Alarm-Targets registriet."

    var template = new ACData.Template({
      // Card Template JSON

      type: "AdaptiveCard",
      body: [
        {
          type: "TextBlock",
          size: "Medium",
          weight: "Bolder",
          text: `RO-Bot Kanalübersicht`,
        },
        {
          type: "TextBlock",
          text: message,
          wrap: true,
        },
        {
          type: "Container",
          $data: facts,
          items: [
            {
              type: "TextBlock",
              wrap: true,
              text: "${team} / ${name}:",
              weight: "Bolder",
            },
            {
              type: "TextBlock",
              text: "${id}",
              wrap: true,
              spacing: "None",
            },
          ],
        },
        {
          type: "ActionSet",
          actions: [
            {
              type: "Action.Submit",
              title: "Diesen Kanal hinzufügen",
              style: "positive",
              data: { text: "add" },
            },
            {
              type: "Action.Submit",
              title: "Diesen Kanal entfernen",
              style: "destructive",
              data: { text: "remove" },
            },
          ],
        },
      ],
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.3",
    });
    var card = template.expand({
      $root: {
        facts,
      },
    });

    await context.sendActivity({
      attachments: [CardFactory.adaptiveCard(card)],
    });
  }

  async sendAlarm(message) {
    await adapter.continueConversation(
      this.conversationReferences[message.target],
      async (turnContext) => {
        var template = new ACData.Template(
          JSON.parse(fs.readFileSync("alarmTemplate.json", "utf-8").toString())
        );

        const alarmData = {
          from: message.e_from
            .replace("pointomega/redone/mod/", "")
            .replace("srv", "RedOne"),
          id: message.a_id,
          error_class: "IMPASA",
          text: message.text,
          status: "Neu",
          users: [],
          activityID: null,
          target: message.target,
          targetId: message.t_id,
        };

        var card = template.expand({
          $root: alarmData,
        });

        const response = await turnContext.sendActivity({
          attachments: [CardFactory.adaptiveCard(card)],
        });
        alarmData.activityID = response.id;
        redisClient.set(alarmData.id, JSON.stringify(alarmData));

        // confirm notification
        postMessage({
          e_type: "IND",
          e_name: "Notified",
          a_id: alarmData.id,
          t_id: alarmData.targetId,
        });
      }
    );
  }

  unregister() {
    postMessage({
      e_type: "IND",
      e_name: "Unregister",
      m_role: "1",
    });
  }
}

function postMessage(message) {

  message.e_from = botTopic;
  message.e_id = Date.now() / 1000;
  message.m_name = botName;

  mqttClient.publish(
      srvTopic,
      JSON.stringify(message),
      { qos: 1 }
    );
}

module.exports.ProactiveBot = ProactiveBot;
