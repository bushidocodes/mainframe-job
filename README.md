# mainframe-job
*The simple Node.js module for interacting with the z/OS Job Entry Subsystem*

# What is a mainframe?
Mainframes are specialized data processing systems built for massively concurrent I/O. Modern IBM mainframes use the z/Architecture (also known as s390x), a modern 64-bit architecture that extends the IBM System/360 architecture released in 1964. The dominant operating system of the IBM Mainframe architecture is z/OS, a system that is descended from the OS/360 operating system famously described in the software engineering classic [The Mythical Man Month](https://en.wikipedia.org/wiki/The_Mythical_Man-Month).

In contast to other computer architectures, most work performed on a mainframe is performed in batch. A job is submitted prepended by a [domain-specific langauge](https://en.wikipedia.org/wiki/Domain-specific_language) called the [Job Control Language](https://en.wikipedia.org/wiki/Job_Control_Language). Back in the 60s, Job Control Language would be written to punched cards and fed into card readers (which is why JCL cannot exceed 80 columns today). However, modern JCL is submitted to the z/OS Job Entry Subsystem, which is made accessible to networked systems over a variety of protocols, including an extended form of the standard [File Transfer Protocol](https://en.wikipedia.org/wiki/File_Transfer_Protocol).

# What does Mainframe-Job do?
mainframe-job is a Node.js module that wrappers the z/OS-specific services made accessible over ftp. This allows direct submission of jobs from Node.js to the z/OS Job Entry Subsystem.

# Installation

```sh
npm install zos-jes
```

Requires Node.js 18 or newer.

# Usage

```ts
import { JobEntrySubsystem } from "zos-jes";

const jes = new JobEntrySubsystem({
  host: "zos.example.com",
  user: "IBMUSER",
  password: "********",
  // any other basic-ftp AccessOptions, e.g. `secure: true`
});

const jcl = Buffer.from(
  [
    "//IBMUSER JOB ,CLASS=A,MSGCLASS=X",
    "//RUN     EXEC PGM=IEFBR14",
  ].join("\r\n"),
  "ascii",
);

const output = await jes.submitJob(jcl, "run.jcl");
console.log(output.toString("ascii"));
```

`submitJob(input, remoteFileName)` accepts the JCL as a path to a local file
(`string`), a `Readable` stream, or a `Buffer`, and resolves with the job
output captured from JES as a `Buffer`. The FTP connection is always closed,
whether the job succeeds or fails.

A complete, runnable example lives in [`examples/submit-job.ts`](examples/submit-job.ts).

# Development

```sh
npm install      # install dependencies
npm run build    # compile TypeScript to dist/
npm test         # run the unit tests (no mainframe required)
npm run lint     # lint with ESLint
```

The unit tests inject a fake FTP client, so the full submission flow is
verified without a live z/OS host.

# Contributors 🙌 🙌 🙌 🙌
- Micah Rairdon ([Tiberriver256](https://github.com/Tiberriver256))

# Special Thanks
This module is inspired by a python script written by Northern Illinois University called [JESzftp](https://github.com/niumainframe/JESftp). There aren't many universities teaching mainframes these days, and it's awesome to see students working to bridge traditional Enterprise technologies with the world of open-source software. Go Huskies!!!

# Useful References

- http://www.ibm.com/support/knowledgecenter/SSLTBW_2.1.0/com.ibm.zos.v2r1.halu001/intfjessubmitstep.htm
- https://www.npmjs.com/package/jsftp
- https://docs.python.org/2/library/ftplib.html
- https://media.blackhat.com/us-13/US-13-Young-Mainframes-The-Past-Will-Come-Back-to-Haunt-You-WP.pdf
- http://www.ibm.com/support/knowledgecenter/SSLTBW_2.1.0/com.ibm.zos.v2r1.bpxa400/xbat.htm
