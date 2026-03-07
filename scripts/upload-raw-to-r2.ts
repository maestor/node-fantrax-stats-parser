#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type ReportType = "regular" | "playoffs";

interface UploadStats {
  checked: number;
  uploaded: number;
  removed: number;
  skippedByFilter: number;
  invalidName: number;
  errors: number;
}

type ParsedRawFile = {
  teamId: string;
  reportType: ReportType;
  seasonStartYear: number;
};

const RAW_PREFIX = "rawFiles";

const getEnvOrThrow = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const createR2Client = (): S3Client => {
  return new S3Client({
    region: "auto",
    endpoint: getEnvOrThrow("R2_ENDPOINT"),
    credentials: {
      accessKeyId: getEnvOrThrow("R2_ACCESS_KEY_ID"),
      secretAccessKey: getEnvOrThrow("R2_SECRET_ACCESS_KEY"),
    },
  });
};

const parseSeasonArg = (args: string[]): number | null => {
  const seasonArg = args.find((arg) => arg.startsWith("--season="));
  if (!seasonArg) return null;
  const value = Number(seasonArg.split("=")[1]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid --season value: ${seasonArg.split("=")[1]}`);
  }
  return value;
};

const parseReportTypeArg = (args: string[]): ReportType | null => {
  const reportTypeArg = args.find((arg) => arg.startsWith("--report-type="));
  if (!reportTypeArg) return null;
  const value = reportTypeArg.split("=")[1];
  if (value !== "regular" && value !== "playoffs") {
    throw new Error(`Invalid --report-type value: ${value}`);
  }
  return value;
};

const parseRawFileName = (fileName: string): ParsedRawFile | null => {
  const match = fileName.match(
    /^(.+)-([0-9]+)-(regular|playoffs)-([0-9]{4})-([0-9]{4})\.csv$/,
  );
  if (!match) return null;

  const [, , teamId, reportType, startYear, endYear] = match;
  const seasonStartYear = Number(startYear);
  const expectedEndYear = seasonStartYear + 1;
  if (Number(endYear) !== expectedEndYear) return null;

  return {
    teamId,
    reportType: reportType as ReportType,
    seasonStartYear,
  };
};

const calculateMD5 = (content: Buffer): string => {
  return crypto.createHash("md5").update(content).digest("hex");
};

const main = async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const keepTempFiles = args.includes("--keep-temp");
  const seasonFilter = parseSeasonArg(args);
  const reportTypeFilter = parseReportTypeArg(args);

  const tempDir = path.resolve(process.cwd(), "csv", "temp");
  const bucketName = getEnvOrThrow("R2_BUCKET_NAME");
  const client = createR2Client();

  console.info("🚀 Starting raw CSV upload to R2...");
  console.info(`   Source: ${tempDir}`);
  console.info(`   Prefix: ${RAW_PREFIX}/`);
  console.info(`   Season filter: ${seasonFilter ?? "all"}`);
  console.info(`   Report type filter: ${reportTypeFilter ?? "all"}`);
  console.info("   Upload mode: force overwrite");
  console.info(`   Cleanup temp: ${keepTempFiles ? "false (--keep-temp)" : "true"}`);
  console.info(`   Dry run: ${dryRun}`);
  console.info("");

  if (!fs.existsSync(tempDir)) {
    console.info(`No temp directory found: ${tempDir}`);
    return;
  }

  const files = fs.readdirSync(tempDir).filter((name) => name.endsWith(".csv"));
  if (!files.length) {
    console.info(`No CSV files found in ${tempDir}`);
    return;
  }

  const stats: UploadStats = {
    checked: 0,
    uploaded: 0,
    removed: 0,
    skippedByFilter: 0,
    invalidName: 0,
    errors: 0,
  };

  for (const fileName of files) {
    stats.checked++;
    const localPath = path.join(tempDir, fileName);
    const parsed = parseRawFileName(fileName);

    if (!parsed) {
      stats.invalidName++;
      console.error(`  ⚠️  Invalid raw CSV filename, skipping: ${fileName}`);
      continue;
    }

    if (seasonFilter !== null && parsed.seasonStartYear !== seasonFilter) {
      stats.skippedByFilter++;
      continue;
    }
    if (reportTypeFilter !== null && parsed.reportType !== reportTypeFilter) {
      stats.skippedByFilter++;
      continue;
    }

    const r2Key = `${RAW_PREFIX}/${parsed.teamId}/${fileName}`;
    try {
      if (dryRun) {
        console.info(`  🔍 Would upload: ${localPath} -> ${r2Key}`);
        stats.uploaded++;
        continue;
      }

      const content = fs.readFileSync(localPath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: r2Key,
          Body: content,
          ContentType: "text/csv",
          Metadata: {
            "upload-date": new Date().toISOString(),
            "md5-hash": calculateMD5(content),
            "source-path": "csv/temp",
            "raw-file": "true",
          },
        }),
      );
      console.info(`  ✅ Uploaded: ${r2Key}`);
      stats.uploaded++;

      if (!keepTempFiles) {
        fs.unlinkSync(localPath);
        stats.removed++;
      }
    } catch (error) {
      stats.errors++;
      console.error(
        `  ❌ Error uploading ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.info("");
  console.info("📊 Summary:");
  console.info(`   Files checked: ${stats.checked}`);
  console.info(`   Uploaded: ${stats.uploaded}`);
  console.info(`   Removed from csv/temp: ${stats.removed}`);
  console.info(`   Skipped by filter: ${stats.skippedByFilter}`);
  console.info(`   Invalid filenames: ${stats.invalidName}`);
  console.info(`   Errors: ${stats.errors}`);
  console.info("");
  console.info("✨ Done!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
