import { Readable, Writable } from "node:stream";
import { Client, type AccessOptions } from "basic-ftp";

/**
 * The slice of a `basic-ftp` {@link Client} that {@link JobEntrySubsystem}
 * relies on.
 *
 * Depending on an interface rather than the concrete `Client` lets callers
 * inject a fake in tests, so the job-submission logic can be exercised without
 * a live z/OS host.
 */
export interface FtpClient {
  access(options: AccessOptions): Promise<unknown>;
  send(command: string): Promise<unknown>;
  uploadFrom(source: Readable | string, remotePath: string): Promise<unknown>;
  downloadTo(destination: Writable, remotePath: string): Promise<unknown>;
  close(): void;
}

/** Connection settings forwarded to the underlying FTP client. */
export type JobEntrySubsystemOptions = AccessOptions;

/**
 * Accepted forms of JCL to submit:
 * - `string` — path to a local file,
 * - {@link Readable} — a stream of JCL, or
 * - {@link Buffer} — the JCL bytes themselves.
 */
export type JobInput = string | Readable | Buffer;

/**
 * Submits JCL jobs to the z/OS Job Entry Subsystem (JES) over FTP.
 *
 * z/OS exposes JES through an extended FTP dialect: issuing
 * `SITE FILETYPE=JES` switches the session into job-submission mode, after
 * which a stored file is interpreted as JCL and handed to the subsystem.
 *
 * @see https://www.ibm.com/docs/en/zos/latest?topic=subcommands-submitting-jobs
 */
export class JobEntrySubsystem {
  constructor(
    private readonly connectionOptions: JobEntrySubsystemOptions,
    private readonly createClient: () => FtpClient = () => new Client(),
  ) {}

  /**
   * Submits JCL to JES and resolves with the captured job output.
   *
   * The FTP connection is always closed, whether the job succeeds or fails.
   *
   * @param input          JCL to submit (see {@link JobInput}).
   * @param remoteFileName Name to store the JCL as on the host.
   * @returns The raw job output returned by JES.
   */
  async submitJob(input: JobInput, remoteFileName: string): Promise<Buffer> {
    const client = this.createClient();
    try {
      await client.access(this.connectionOptions);
      // JCL is text; transfer in ASCII so the host performs EBCDIC translation.
      await client.send("TYPE A");
      await client.uploadFrom(toUploadSource(input), remoteFileName);
      await client.send("SITE FILEtype=JES NOJESGETBYDSN");
      return await downloadToBuffer(client, remoteFileName);
    } finally {
      client.close();
    }
  }
}

/** Normalizes the accepted job inputs into something `basic-ftp` can upload. */
function toUploadSource(input: JobInput): Readable | string {
  return Buffer.isBuffer(input) ? Readable.from(input) : input;
}

/** Streams a remote file into memory and returns it as a single Buffer. */
async function downloadToBuffer(
  client: FtpClient,
  remoteFileName: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  await client.downloadTo(sink, remoteFileName);
  return Buffer.concat(chunks);
}
