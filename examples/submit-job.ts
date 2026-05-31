/**
 * End-to-end example: submits a small TSO job to a real z/OS host and prints
 * the output JES returns.
 *
 * This talks to a live mainframe, so it is NOT part of the test suite. Run it
 * against your own host with, for example:
 *
 *   npx tsx examples/submit-job.ts
 *
 * adjusting the connection options below first.
 */
import { JobEntrySubsystem } from "../src/index";

const connectionOptions = {
  host: "localhost",
  user: "test",
  password: "test",
};

const jobEntrySubsystem = new JobEntrySubsystem(connectionOptions);

const jclTestJob = `
//${connectionOptions.user}TSS  JOB 5,'${connectionOptions.user}',CLASS=P,MSGCLASS=X,
//            NOTIFY=${connectionOptions.user},MSGLEVEL=(,0)
//**
//**
//**
//**
//********************************************************************
//TSSTMP   EXEC PGM=IKJEFT01,REGION=300K,
//            PARM='TSS LIS(${connectionOptions.user}) DATA(ALL)'
//SYSPRINT DD SYSOUT=*
//SYSTSPRT DD SYSOUT=*
//SYSTSIN  DD DUMMY
//
`;

// JCL must use CRLF line endings on the wire.
const jclBuffer = Buffer.from(jclTestJob.replace(/\r?\n/g, "\r\n"), "ascii");

jobEntrySubsystem
  .submitJob(jclBuffer, "tsslist.jcl")
  .then((output) => {
    console.log(output.toString("ascii"));
  })
  .catch((error) => {
    console.error("Job submission failed:", error);
    process.exitCode = 1;
  });
