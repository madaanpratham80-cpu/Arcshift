import { execFileSync } from 'node:child_process';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, MongoServerSelectionError } from 'mongodb';

const address = '127.0.0.1:27018';
const replicaSet = 'careerAgentLocal';
const storagePath = fileURLToPath(new URL('../.local/mongo', import.meta.url));
const directUri = 'mongodb://' + address + '/?directConnection=true';
const replicaUri = 'mongodb://' + address + '/?replicaSet=' + replicaSet;

async function directClient() {
  const client = new MongoClient(directUri, { serverSelectionTimeoutMS: 2_500 });
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}

async function connectOrStart() {
  try {
    return await directClient();
  } catch (error) {
    if (!(error instanceof MongoServerSelectionError)) throw error;
  }
  await mkdir(storagePath, { recursive: true, mode: 0o700 });
  if ((await realpath(storagePath)) !== storagePath || ((await stat(storagePath)).mode & 0o077) !== 0) {
    throw new Error('Expected a private MongoDB directory at .local/mongo.');
  }
  const executable = process.env.MONGOD_BIN || 'mongod';
  execFileSync(executable, [
    '--fork', '--bind_ip', '127.0.0.1', '--port', '27018', '--nounixsocket',
    '--dbpath', storagePath, '--replSet', replicaSet, '--logpath', join(storagePath, 'mongod.log'),
  ], { stdio: 'inherit', timeout: 15_000 });
  return await directClient();
}

async function startLocalMongo() {
  const bootstrap = await connectOrStart();
  try {
    const admin = bootstrap.db('admin');
    const { parsed } = await admin.command({ getCmdLineOpts: 1 });
    if (parsed.storage?.dbPath !== storagePath || parsed.replication?.replSet !== replicaSet) {
      throw new Error('Port 27018 is occupied by another MongoDB service.');
    }
    const hello = await admin.command({ hello: 1 });
    if (!hello.setName && hello.isreplicaset) {
      await admin.command({ replSetInitiate: { _id: replicaSet, members: [{ _id: 0, host: address }] } });
    }
  } finally {
    await bootstrap.close();
  }
  const client = new MongoClient(replicaUri, { serverSelectionTimeoutMS: 15_000 });
  try {
    await client.db('admin').command({ ping: 1 });
    console.log('Arcshift MongoDB replica set ready at ' + address + '.');
  } finally {
    await client.close();
  }
}

try {
  await startLocalMongo();
} catch (error) {
  if (error instanceof Error && error.message.startsWith('Port 27018')) {
    console.error(error.message);
  } else {
    console.error('Could not start Arcshift MongoDB. Check the mongod installation and .local/mongo/mongod.log.');
  }
  process.exitCode = 1;
}
