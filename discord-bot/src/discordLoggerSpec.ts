import { JobSpec } from "@livestack/core";
import { z } from "zod";
import fs from "fs";

const AUTO_START_WORKER = true;

export const discordLoggerSpec = new JobSpec({
  name: "discord-logger",
  //no input needed
  input: z.void(),
  output: z.object({
    log: z.string(),
  }),
});

const logFilePath = "./logs/conversations.log";

const readLatestLogEntry = (): string => {
  if (!fs.existsSync(logFilePath)) {
    return "";
  }

  const logData = fs.readFileSync(logFilePath, "utf8");
  const logEntries = logData.trim().split("\n");
  return logEntries.length ? logEntries[logEntries.length - 1] : "";
};

export const discordLoggerWorkerDef = discordLoggerSpec.defineWorker({
  autostartWorker: AUTO_START_WORKER,
  processor: async ({ output }) => {
    const logEntry = readLatestLogEntry();
    if (logEntry) {
      await output.emit({ log: logEntry });
    }
  },
});
