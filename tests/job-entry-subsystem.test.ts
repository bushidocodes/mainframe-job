import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { type FtpClient, JobEntrySubsystem } from "../src/index";

/**
 * In-memory stand-in for a `basic-ftp` client. It records every call so tests
 * can assert on the exact FTP command sequence, captures uploaded payloads, and
 * can be told to fail on a given step to exercise error handling — all without
 * touching a network or a real z/OS host.
 */
class FakeFtpClient implements FtpClient {
  readonly calls: string[] = [];
  accessOptions?: unknown;
  uploadedSource?: Readable | string;
  uploadedContents?: string;
  closed = false;

  constructor(
    private readonly downloadPayload: Buffer = Buffer.from("JES JOB OUTPUT"),
    /** Name of the call that should reject, e.g. "uploadFrom". */
    private readonly failOn?: "access" | "uploadFrom" | "downloadTo",
  ) {}

  async access(options: unknown): Promise<unknown> {
    this.calls.push("access");
    this.accessOptions = options;
    this.maybeFail("access");
    return {};
  }

  async send(command: string): Promise<unknown> {
    this.calls.push(`send:${command}`);
    return {};
  }

  async uploadFrom(source: Readable | string, remotePath: string): Promise<unknown> {
    this.calls.push(`uploadFrom:${remotePath}`);
    this.maybeFail("uploadFrom");
    this.uploadedSource = source;
    if (typeof source !== "string") {
      const chunks = await Array.fromAsync(source, (chunk) => Buffer.from(chunk));
      this.uploadedContents = Buffer.concat(chunks).toString();
    }
    return {};
  }

  async downloadTo(destination: Writable, remotePath: string): Promise<unknown> {
    this.calls.push(`downloadTo:${remotePath}`);
    this.maybeFail("downloadTo");
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    destination.on("error", reject);
    destination.end(this.downloadPayload, () => resolve());
    await promise;
    return {};
  }

  [Symbol.dispose](): void {
    this.close();
  }

  close(): void {
    this.closed = true;
    this.calls.push("close");
  }

  private maybeFail(call: NonNullable<FakeFtpClient["failOn"]>): void {
    if (this.failOn === call) {
      throw new Error(`${call} failed`);
    }
  }
}

const connectionOptions = { host: "zos.example.com", user: "ibmuser", password: "secret" };

function newSubsystem(client: FakeFtpClient) {
  return new JobEntrySubsystem(connectionOptions, () => client);
}

describe("JobEntrySubsystem.submitJob", () => {
  it("issues the JES FTP commands in order and closes the connection", async () => {
    const client = new FakeFtpClient();
    await newSubsystem(client).submitJob(Buffer.from("//JOB"), "job.jcl");

    expect(client.calls).toEqual([
      "access",
      "send:TYPE A",
      "send:SITE FILEtype=JES NOJESGETBYDSN",
      "uploadFrom:job.jcl",
      "downloadTo:job.jcl",
      "close",
    ]);
    expect(client.accessOptions).toBe(connectionOptions);
  });

  it("resolves with the job output captured from the host", async () => {
    const client = new FakeFtpClient(Buffer.from("RC=0000"));
    const output = await newSubsystem(client).submitJob(Buffer.from("//JOB"), "job.jcl");

    expect(output).toBeInstanceOf(Buffer);
    expect(output.toString()).toBe("RC=0000");
  });

  it("uploads the bytes of a Buffer input verbatim", async () => {
    const client = new FakeFtpClient();
    await newSubsystem(client).submitJob(Buffer.from("//RUN EXEC PGM=IEFBR14"), "job.jcl");

    expect(client.uploadedContents).toBe("//RUN EXEC PGM=IEFBR14");
  });

  it("forwards a string path straight through as a local file path", async () => {
    const client = new FakeFtpClient();
    await newSubsystem(client).submitJob("/local/path/to/job.jcl", "job.jcl");

    expect(client.uploadedSource).toBe("/local/path/to/job.jcl");
  });

  it("forwards a Readable stream without buffering it into a path", async () => {
    const client = new FakeFtpClient();
    const stream = Readable.from("//STREAMED JCL");
    await newSubsystem(client).submitJob(stream, "job.jcl");

    expect(client.uploadedSource).toBe(stream);
    expect(client.uploadedContents).toBe("//STREAMED JCL");
  });

  it("closes the connection and rejects when a step fails", async () => {
    const client = new FakeFtpClient(undefined, "uploadFrom");

    await expect(newSubsystem(client).submitJob(Buffer.from("//JOB"), "job.jcl")).rejects.toThrow(
      "uploadFrom failed",
    );
    expect(client.closed).toBe(true);
    expect(client.calls).toContain("close");
    // The download must not run once the upload has failed.
    expect(client.calls).not.toContain("downloadTo:job.jcl");
  });
});
