import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export class R2Client {
  private client: S3Client;
  private bucketName: string;

  constructor(config: R2Config) {
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucketName = config.bucketName;
  }

  async getObject(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.client.send(command);
    return await this.streamToString(response.Body as Readable);
  }

  async putObject(key: string, body: string | Buffer): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: "text/csv",
    });

    await this.client.send(command);
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async getLastModified(key: string): Promise<Date | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const response = await this.client.send(command);
      return response.LastModified || null;
    } catch {
      return null;
    }
  }

  private async streamToString(stream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
  }
}

// Singleton instance (reused across serverless function invocations)
let r2Instance: R2Client | null = null;

export const getR2Client = (): R2Client => {
  if (!r2Instance) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error("R2 environment variables not configured");
    }

    r2Instance = new R2Client({
      endpoint,
      accessKeyId,
      secretAccessKey,
      bucketName,
    });
  }

  return r2Instance;
};

export const isR2Enabled = (): boolean => {
  return process.env.USE_R2_STORAGE === "true";
};
