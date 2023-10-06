import { QueueEvents, QueueEventsOptions, WorkerOptions } from "bullmq";
import { GenericRecordType, QueueName } from "./workerCommon";
import { Queue, Job } from "bullmq";
import { getLogger } from "../utils/createWorkerLogger";
import {
  _upsertAndMergeJobLogByIdAndType,
  ensureJobDependencies,
  getJobLogByIdAndType,
} from "../db/knexConn";
import { Knex } from "knex";
import { v4 } from "uuid";

const queueMap = new Map<
  QueueName<GenericRecordType>,
  ReturnType<typeof createAndReturnQueue>
>();

export const getMicroworkerQueueByName = <
  JobDataType,
  JobReturnType,
  T extends GenericRecordType
>(
  p: Parameters<
    typeof createAndReturnQueue<JobDataType, JobReturnType, T>
  >[0] & {
    queueNamesDef: T;
  }
): ReturnType<typeof createAndReturnQueue<JobDataType, JobReturnType, T>> => {
  const { queueNamesDef, queueName } = p;
  if (!Object.values(queueNamesDef).includes(queueName)) {
    throw new Error(`Can not handle queueName ${queueName}!`);
  }
  const existing = queueMap.get(queueName) as ReturnType<
    typeof createAndReturnQueue<JobDataType, JobReturnType, T>
  >;
  if (existing) {
    return existing;
  } else {
    return createAndReturnQueue<JobDataType, JobReturnType, T>(p);
  }
};

function createAndReturnQueue<
  JobDataType,
  JobReturnType,
  T extends GenericRecordType = GenericRecordType
>({
  projectId,
  queueName,
  workerOptions,
  db,
}: {
  projectId: string;
  queueName: QueueName<T>;
  workerOptions?: WorkerOptions;
  db: Knex;
}) {
  const queue = new Queue<JobDataType, JobReturnType>(queueName, workerOptions);
  const logger = getLogger(`wkr:${queueName}`);

  // return queue as Queue<JobDataType, JobReturnType>;
  const addJob: typeof queue.add = async (name, data, opts) => {
    const j = await queue.add(name, data, opts);
    logger.info(
      `Added job with ID: ${j.id}, ${j.queueName} ` +
        `${JSON.stringify(j.data, longStringTruncator)}`
    );

    await _upsertAndMergeJobLogByIdAndType({
      projectId,
      jobType: queueName,
      jobId: j.id!,
      jobData: j.data,
      dbConn: db,
    });

    return j;
  };

  const getJob = async (
    jobId: string
  ): Promise<Pick<Job<JobDataType, JobReturnType>, "id" | "data"> | null> => {
    const j = await queue.getJob(jobId);
    if (!j) {
      const dbJ = await getJobLogByIdAndType({
        jobType: queueName,
        jobId,
        projectId,
        dbConn: db,
      });
      if (dbJ) {
        return {
          id: dbJ.job_id,
          data: dbJ.job_data,
        };
      }
    }
    return j || null;
  };

  const enqueueJobAndGetResult = async ({
    jobName,
    initJobData,
    queueEventsOptions,
  }: {
    jobName?: string;
    initJobData: JobDataType;
    queueEventsOptions?: QueueEventsOptions;
  }): Promise<JobReturnType> => {
    if (!jobName) {
      jobName = `${queueName}-${v4()}`;
    }

    console.info(`Enqueueing job ${jobName} with data:`, initJobData);
    const queueEvents = new QueueEvents(queueName, {
      ...queueEventsOptions,
    });

    const job = await addJob(jobName, initJobData, {
      jobId: jobName,
    });

    try {
      await job.waitUntilFinished(queueEvents);
      const result = await Job.fromId(queue, jobName);
      return result!.returnvalue as JobReturnType;
    } finally {
      await queueEvents.close();
    }
  };
  const funcs = {
    addJob,
    enqueueJobAndGetResult,
    getJob,
    _rawQueue: queue,
  };

  // todo: fix typing
  queueMap.set(queueName, funcs as any);

  return funcs;
}

export const longStringTruncator = (k: string, v: unknown) => {
  // truncate long strings
  if (typeof v === "string" && v.length > 100) {
    return `${v.slice(0, 100)}...`;
  }
  return v;
};