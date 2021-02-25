// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const {
  BotFrameworkAdapter,
  ActivityHandler,
  TurnContext,
  ConsoleTranscriptLogger,
  CardFactory,
  ActionTypes,
  TeamsInfo,
  MessageFactory,
  ActivityFactory,
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
const options = {
  clientId: "RO-bot",
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
  console.log("mqtt connected ..");
});

var message_options = {
  //   retain: true,
  qos: 1,
};
const registration_message = {
  e_type: "IND",
  e_name: "Register",
  e_from: botTopic,
  e_id: Date.now(),
  m_name: "RO-Bot",
  m_role: "1",
};

// register the bot with RedOne
setTimeout(function () {
  mqttClient.publish(
    srvTopic,
    JSON.stringify(registration_message),
    message_options
  );
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
      if (topic === botTopic) {
        console.log(`${topic}: ${message}`);
        message = JSON.parse(message.toString());
        if (message.e_type === "REQ" && message.e_name === "Notify") {
          if (Object.entries(this.conversationReferences).length === 0) {
            console.log("Keine channel registriert!");
          } else {
            message.target = choose(Object.keys(this.conversationReferences));
            // console.log(message);
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

      console.log("Conversation update!");

      await next();
    });

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;

      // By calling next() you ensure that the next BotHandler is run.
      await next();
    });

    this.onTurn = async (turnContext) => {
      // turnContext.onSendActivities(async(ctx, activities, nextSend) => {
      //     activities.forEach(async(activity) => {
      //         if (activity.channelData.saveMe) {
      //             this.savedActivity = activity;
      //         }
      console.log("turning ..");
      //     });
      //     return await nextSend();
      // });
    };

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
                // console.log(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
              }
            );
            redisClient.set(alarmData.id, JSON.stringify(alarmData));

            // send confirmation to RedOne
            var acceptMessage = {
              e_type: "IND",
              e_name: "Accept",
              e_from: botTopic,
              e_id: Date.now(),
              a_id: alarmData.id,
              t_id: alarmData.targetId,
              t_code: "0",
            };
            mqttClient.publish(
              srvTopic,
              JSON.stringify(acceptMessage),
              message_options
            );
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
                // console.log(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
              }
            );
            redisClient.set(alarmData.id, JSON.stringify(alarmData));
            console.log(alarmData);

            // send confirmation to RedOne
            var doneMessage = {
              e_type: "IND",
              e_name: "Done",
              e_from: botTopic,
              e_id: Date.now(),
              a_id: alarmData.id,
              t_id: alarmData.targetId,
              e_cause: 0,
            };
            mqttClient.publish(
              srvTopic,
              JSON.stringify(doneMessage),
              message_options
            );
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
    //check if its related to the bot?
    console.log("Conversation update..");

    const activity = context.activity;

    if (activity.channelData.eventType === "teamDeleted") {
      console.log("team deleted");
      for (const channelId of Object.keys(
        this.channels[activity.channelData.team.name]
      )) {
        delete this.conversationReferences[channelId];
      }
      console.log("references deleted");
      delete this.channels[activity.channelData.team.name];
      console.log("channels deleted");
      this.saveConversations();
      this.saveChannels();
      return;
    }
    if (activity.channelData.eventType === "teamMemberRemoved") {
      if (activity.membersRemoved[0].id.includes(this.appId)) {
        console.log(this.channels[activity.channelData.team.name]);
        for (var channelId of Object.keys(
          this.channels[activity.channelData.team.name]
        )) {
          delete this.conversationReferences[channelId];
          console.log(`deleted ${channelId}`);
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
    var teamInfo = await TeamsInfo.getTeamDetails(context);

    switch (activity.channelData.eventType) {
      case "channelRenamed":
        if (!this.channels[teamInfo.name]) {
          this.channels[teamInfo.name] = {};
        }
        this.channels[teamInfo.name][activity.channelData.channel.id] =
          activity.channelData.channel.name;
        break;

      case "teamMemberAdded":
        console.log("adding member");
        if (activity.membersAdded[0].id.includes(this.appId)) {
          this.conversationReferences[
            conversationReference.conversation.id
          ] = conversationReference;
        }

        this.channels[teamInfo.name] = {};
        this.channels[teamInfo.name][activity.channelData.team.id] =
          "Allgemein";
        break;

      case "channelDeleted":
        console.log("channel deleted");
        if (!this.channels[teamInfo.name]) {
          return;
        }
        delete this.channels[teamInfo.name][activity.channelData.channel.id];
        delete this.conversationReferences[
          conversationReference.conversation.id
        ];
        break;
    }
    this.saveConversations();
    this.saveChannels();
    console.log("all saved!");
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
    console.log(Object.keys(this.conversationReferences));
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
          text:
            "Aktuell sind die folgenden Kanäle registriert und als Alarm-Target verfügbar.",
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
        const notificationConfirmation = {
          e_type: "IND",
          e_name: "Notified",
          e_from: botTopic,
          e_id: Date.now(),
          a_id: alarmData.id,
          t_id: alarmData.targetId,
        };

        mqttClient.publish(
          srvTopic,
          JSON.stringify(notificationConfirmation),
          message_options
        );
      }
    );
  }

  unregister() {
    const deregistration_message = {
      e_type: "IND",
      e_name: "Unregister",
      e_from: "pointomega/redone/mod/RO-Bot",
      e_id: 1,
      m_name: "RO-Bot",
      m_role: "1",
    };

    mqttClient.publish(
      srvTopic,
      JSON.stringify(deregistration_message),
      message_options
    );
  }
}

module.exports.ProactiveBot = ProactiveBot;
