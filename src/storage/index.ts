import fs from "fs";
import { getR2Client, isR2Enabled } from "./r2-client";

export interface StorageAdapter {
  readFile(filePath: string): Promise<string>;
  fileExists(filePath: string): Promise<boolean>;
  getLastModified(filePath: string): Promise<Date | null>;
}

class FileSystemStorage implements StorageAdapter {
  async readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, "utf-8");
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getLastModified(filePath: string): Promise<Date | null> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.mtime;
    } catch {
      return null;
    }
  }
}

class R2Storage implements StorageAdapter {
  private convertPathToKey(filePath: string): string {
    // Convert: /path/to/csv/1/regular-2024-2025.csv
    // To: 1/regular-2024-2025.csv
    const csvIndex = filePath.indexOf("csv/");
    if (csvIndex === -1) {
      throw new Error(`Invalid CSV path: ${filePath}`);
    }
    return filePath.substring(csvIndex + 4); // Skip "csv/"
  }

  async readFile(filePath: string): Promise<string> {
    const key = this.convertPathToKey(filePath);
    const r2 = getR2Client();
    return await r2.getObject(key);
  }

  async fileExists(filePath: string): Promise<boolean> {
    const key = this.convertPathToKey(filePath);
    const r2 = getR2Client();
    return await r2.objectExists(key);
  }

  async getLastModified(filePath: string): Promise<Date | null> {
    const key = this.convertPathToKey(filePath);
    const r2 = getR2Client();
    return await r2.getLastModified(key);
  }
}

let storageInstance: StorageAdapter | null = null;

export const getStorage = (): StorageAdapter => {
  if (!storageInstance) {
    storageInstance = isR2Enabled() ? new R2Storage() : new FileSystemStorage();
  }
  return storageInstance;
};

// For testing: reset singleton
export const resetStorageForTests = (): void => {
  storageInstance = null;
};

// Re-export for convenience
export { isR2Enabled } from "./r2-client";
