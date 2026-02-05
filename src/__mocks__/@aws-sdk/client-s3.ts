// Mock for @aws-sdk/client-s3
export class S3Client {
  constructor(_config: unknown) {}
  send = jest.fn();
}

export class GetObjectCommand {
  constructor(public input: { Bucket: string; Key: string }) {}
}

export class PutObjectCommand {
  constructor(public input: { Bucket: string; Key: string; Body: unknown; ContentType?: string }) {}
}

export class HeadObjectCommand {
  constructor(public input: { Bucket: string; Key: string }) {}
}
