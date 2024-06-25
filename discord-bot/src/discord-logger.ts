import {
    Client,
    GatewayIntentBits,
    TextChannel,
    ChannelType,
    Message,
    PermissionFlagsBits,
  } from "discord.js";
  import fs from "fs";
  import dotenv from "dotenv";
  
  dotenv.config();
  
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
  });
  
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const logFilePath = "./logs/conversations.log";
  
  // Helper function to log messages and their details
  const logMessage = async (message: Message) => {
    const messageDate = message.createdAt;
    const isoTimestamp = messageDate.toISOString();
    const estTimestamp = messageDate.toLocaleString("en-US", { timeZone: "America/New_York" });
  
    let logEntry = `${isoTimestamp} (EST: ${estTimestamp}) - ${message.author.tag}: ${message.content}\n`;
  
    // Log attachments (images, files)
    if (message.attachments.size > 0) {
      message.attachments.forEach(attachment => {
        logEntry += `Attachment: ${attachment.name} (URL: ${attachment.url})\n`;
      });
    }
  
    // Log embeds
    if (message.embeds.length > 0) {
      message.embeds.forEach((embed, index) => {
        logEntry += `Embed ${index + 1}: ${JSON.stringify(embed.toJSON())}\n`;
      });
    }
  
    // Log thread information
    if (message.hasThread) {
      const thread = message.thread;
      logEntry += `Thread: ${thread?.name} (ID: ${thread?.id})\n`;
    }
  
    // Log poll information (if applicable)
    const poll = (message as any).poll;
    if (poll) {
      logEntry += `Poll: ${poll.question}\n`;
      logEntry += `Allow Multiselect: ${poll.allowMultiselect}\n`;
      logEntry += `Expires At: ${poll.expiresAt}\n`;
      logEntry += `Results Finalized: ${poll.resultsFinalized}\n`;
      logEntry += `Answers:\n`;
      for (const [id, answer] of poll.answers.entries()) {
        logEntry += ` - ${answer.text}: ${answer.voteCount} votes\n`;
      }
    }
  
    fs.appendFile(logFilePath, logEntry, (err) => {
      if (err) {
        console.error("Error writing to log file", err);
      }
    });
  };
  
  // Helper function to fetch and log all text messages from a channel
  const fetchMessages = async (channel: TextChannel) => {
    let lastMessageId;
    let fetchedMessages;
    let messagesArray: Message[] = [];
  
    do {
      try {
        fetchedMessages = await channel.messages.fetch({
          limit: 100,
          before: lastMessageId,
        });
        messagesArray = [...fetchedMessages.values(), ...messagesArray];
        lastMessageId = fetchedMessages.last()?.id;
      } catch (error) {
        console.error(`Error fetching messages from channel ${channel.name}:`, error);
        break;
      }
    } while (fetchedMessages.size === 100);
  
    // Log messages in chronological order
    for (const message of messagesArray.reverse()) {
      await logMessage(message);
    }
  };
  
/*
  client.once("ready", async () => {
    console.log(`Logged in as ${client.user?.tag}!`);
  
    if (!guildId) {
      console.error("Guild ID is not available.");
      return;
    }
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.error(`Guild with ID ${guildId} not found`);
      return;
    }
  
    // Create a role with necessary permissions
    let loggerRole = guild.roles.cache.find(role => role.name === 'logger');
    if (!loggerRole) {
      loggerRole = await guild.roles.create({
        name: 'logger',
        permissions: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
        ],
      });
      console.log(`Created role: ${loggerRole.name}`);
    }
  
    // Assign the role to the bot
    const botMember = guild.members.cache.get(client.user!.id);
    if (botMember && !botMember.roles.cache.has(loggerRole.id)) {
      await botMember.roles.add(loggerRole);
      console.log(`Assigned role to bot: ${loggerRole.name}`);
    }
  
    const textChannels = guild.channels.cache.filter(
      (channel) => channel.type === ChannelType.GuildText
    );
  
    // Fetch and log historical messages
    for (const channel of textChannels.values()) {
      const permissions = channel.permissionsFor(client.user!);
      if (!permissions?.has(PermissionFlagsBits.ViewChannel) || 
          !permissions.has(PermissionFlagsBits.ReadMessageHistory)) {
        console.log(`Skipping private channel: ${channel.name}`);
        continue;
      }
  
      console.log(`Fetching messages from channel: ${channel.name}`);
      await fetchMessages(channel as TextChannel);
    }
  
    console.log("Finished fetching historical messages");
  
    // Start real-time logging
    client.on("messageCreate", async (message) => {
      if (message.guild?.id === guildId) {
        await logMessage(message);
      }
    });
  
    client.on("messageReactionAdd", async (reaction, user) => {
      const message = reaction.message;
      if (message.guild?.id === guildId) {
        const messageDate = message.createdAt;
        const isoTimestamp = messageDate.toISOString();
        const estTimestamp = messageDate.toLocaleString("en-US", { timeZone: "America/New_York" });
        const logEntry = `${isoTimestamp} (EST: ${estTimestamp}) - ${user.tag} reacted with ${reaction.emoji.name} to message: ${message.id}\n`;
        fs.appendFile(logFilePath, logEntry, (err) => {
          if (err) {
            console.error("Error writing to log file", err);
          }
        });
      }
    });
  });
  
  client.login(token);
*/

// Revised-adding startLogger and loggerReady, and export them for use in the worker
let loggerReadyResolve: () => void;
const loggerReady = new Promise<void>((resolve) => {
  loggerReadyResolve = resolve;
});

const startLogger = () => {
  client.once("ready", async () => {
    console.log(`Logged in as ${client.user?.tag}!`);

    if (!guildId) {
      console.error("Guild ID is not available.");
      return;
    }
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.error(`Guild with ID ${guildId} not found`);
      return;
    }

    // Create a role with necessary permissions
    let loggerRole = guild.roles.cache.find(role => role.name === 'logger');
    if (!loggerRole) {
      loggerRole = await guild.roles.create({
        name: 'logger',
        permissions: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
        ],
      });
      console.log(`Created role: ${loggerRole.name}`);
    }

    // Assign the role to the bot
    const botMember = guild.members.cache.get(client.user!.id);
    if (botMember && !botMember.roles.cache.has(loggerRole.id)) {
      await botMember.roles.add(loggerRole);
      console.log(`Assigned role to bot: ${loggerRole.name}`);
    }

    const textChannels = guild.channels.cache.filter(
      (channel) => channel.type === ChannelType.GuildText
    );

    // Fetch and log historical messages
    for (const channel of textChannels.values()) {
      const permissions = channel.permissionsFor(client.user!);
      if (!permissions?.has(PermissionFlagsBits.ViewChannel) || 
          !permissions.has(PermissionFlagsBits.ReadMessageHistory)) {
        console.log(`Skipping private channel: ${channel.name}`);
        continue;
      }

      console.log(`Fetching messages from channel: ${channel.name}`);
      await fetchMessages(channel as TextChannel);
    }

    console.log("Finished fetching historical messages");

    // Start real-time logging
    client.on("messageCreate", async (message) => {
      if (message.guild?.id === guildId) {
        await logMessage(message);
      }
    });

    client.on("messageReactionAdd", async (reaction, user) => {
      const message = reaction.message;
      if (message.guild?.id === guildId) {
        const messageDate = message.createdAt;
        const isoTimestamp = messageDate.toISOString();
        const estTimestamp = messageDate.toLocaleString("en-US", { timeZone: "America/New_York" });
        const logEntry = `${isoTimestamp} (EST: ${estTimestamp}) - ${user.tag} reacted with ${reaction.emoji.name} to message: ${message.id}\n`;
        fs.appendFile(logFilePath, logEntry, (err) => {
          if (err) {
            console.error("Error writing to log file", err);
          }
        });
      }
    });

    loggerReadyResolve();
  });

  client.login(token).catch((error) => {
    console.error("Error logging in", error);
    loggerReadyResolve(); // Ensure the promise resolves even on error
  });
};

export { startLogger, loggerReady };
