import { JobSpec } from "@livestack/core";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { startLogger, loggerReady } from "./discord-logger"; 

const AUTO_START_WORKER = true;

export const discordLoggerSpec = new JobSpec({
  name: "discord-logger",
  //no input needed
  input: z.void(),
  output: z.object({
    log: z.string(),
  }),
});

const logFilePath = path.resolve("./logs/conversations.log");

const readLatestLogEntry = (): string => {
  if (!fs.existsSync(logFilePath)) {
    console.error("Log file does not exist. Make sure discord-logger.ts is running.");
    return "";
  }

  const logData = fs.readFileSync(logFilePath, "utf8");
  const logEntries = logData.trim().split("\n");
  return logEntries.length ? logEntries[logEntries.length - 1] : "";
};

/*
export const discordLoggerWorkerDef = discordLoggerSpec.defineWorker({
  autostartWorker: AUTO_START_WORKER,
  processor: async ({ output }) => {
    const logEntry = readLatestLogEntry();
    if (logEntry) {
      await output.emit({ log: logEntry });
    }
  },
});
*/

// Revised-now start the logger in the worker
export const discordLoggerWorkerDef = discordLoggerSpec.defineWorker({
  autostartWorker: AUTO_START_WORKER,
  processor: async ({ output }) => {
    // Start the discord-logger process
    startLogger();
    // Wait for the logger to be ready
    await loggerReady;

    const logEntry = readLatestLogEntry();
    if (logEntry) {
      await output.emit({ log: logEntry });
    } else {
      console.error("No log entry found.");
    }
  },
});
