// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// index.js is used to setup and configure your bot

// Import required packages
const path = require("path");
const WebSocket = require("ws");

// Note: Ensure you have a .env file and include the MicrosoftAppId and MicrosoftAppPassword.
const ENV_FILE = path.join(__dirname, ".env");
require("dotenv").config({ path: ENV_FILE });
const fs = require("fs");

const restify = require("restify");
const ACData = require("adaptivecards-templating");
const redis = require("redis");
const redisClient = redis.createClient();

redisClient.on("error", function (error) {
  console.error(error);
});

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
const {
  BotFrameworkAdapter,
  CardFactory,
  ActionTypes,
  MessageFactory,
  ConsoleTranscriptLogger,
  TeamsInfo,
} = require("botbuilder");

// This bot's main dialog.
const { ProactiveBot } = require("./bots/proactiveBot");

// Create adapter.
// See https://aka.ms/about-bot-adapter to learn more about adapters.
const adapter = new BotFrameworkAdapter({
  appId: process.env.MicrosoftAppId,
  appPassword: process.env.MicrosoftAppPassword,
});

// Catch-all for errors.
adapter.onTurnError = async (context, error) => {
  // This check writes out errors to console log .vs. app insights.
  // NOTE: In production environment, you should consider logging this to Azure
  //       application insights. See https://aka.ms/bottelemetry for telemetry
  //       configuration instructions.
  console.error(`\n [onTurnError] unhandled error: ${error}`);

  // Send a trace activity, which will be displayed in Bot Framework Emulator
  await context.sendTraceActivity(
    "OnTurnError Trace",
    `${error}`,
    "https://www.botframework.com/schemas/error",
    "TurnError"
  );

  // Send a message to the user
  await context.sendActivity("The bot encountered an error or bug.");
  await context.sendActivity(
    "To continue to run this bot, please fix the bot source code."
  );
};

// Create the main dialog.
const conversationReferences = {};
const bot = new ProactiveBot();

// Create HTTP server.
const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
  console.log(`\n${server.name} listening to ${server.url}`);
});

// Listen for incoming activities and route them to your bot main dialog.
server.post("/api/messages", (req, res) => {
  adapter.processActivity(req, res, async (turnContext) => {
    // route to main dialog.
    await bot.run(turnContext);
  });
});

// Listen for incoming notifications and send proactive messages to users.
server.get("/api/notify", async (req, res) => {
  console.log("notify incoming");
  console.log(conversationReferences);
  console.log(bot.conversationReferences);

  for (const conversationReference of Object.values(
    bot.conversationReferences
  )) {
    await adapter.continueConversation(
      conversationReference,
      async (turnContext) => {
        // If you encounter permission-related errors when sending this message, see
        // https://aka.ms/BotTrustServiceUrl
        await turnContext.sendActivity("proactive hello");
      }
    );
  }

  res.setHeader("Content-Type", "text/html");
  res.writeHead(200);
  res.write(
    "<html><body><h1>Proactive messages have been sent.</h1></body></html>"
  );
  res.end();
});

// get connection to help sensor and post all messagees
console.log("Opening WebSocket connection to sensor ...");
let socket = new WebSocket("ws://192.168.188.33:8080");

// message received - show the message in div#messages
socket.onmessage = function (event) {
  // const data = JSON.parse(event.data);
  // if (data.event === "result") {
  //     sendStuff('Da hat wieder einer Hilfe geschrien!');
  // }
};

async function sendStuff(message) {
  for (const conversationReference of Object.values(
    bot.conversationReferences
  )) {
    await adapter.continueConversation(
      conversationReference,
      async (turnContext) => {
        await turnContext.sendActivity(message);
      }
    );
  }
}

// process.on("SIGTERM", function () {
//   console.log("SCHÜSSSSS");
//   process.exit(0);
// });
process.on("SIGINT", function () {
  bot.unregister();
  setTimeout(function () {
    process.exit(0);
  }, 500);
});
// process.on("exit", (code) => {
//   process.exit(0);
// });
