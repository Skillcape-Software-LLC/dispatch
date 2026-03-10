import Loki from 'lokijs';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import type {
  RequestDocument,
  CollectionDocument,
  EnvironmentDocument,
  HistoryDocument,
} from './types';

let db: Loki;
let requests: Collection<RequestDocument>;
let collections: Collection<CollectionDocument>;
let environments: Collection<EnvironmentDocument>;
let history: Collection<HistoryDocument>;

let dbReady = false;
const readyCallbacks: Array<() => void> = [];

function onReady(cb: () => void): void {
  if (dbReady) {
    cb();
  } else {
    readyCallbacks.push(cb);
  }
}

function resolveCollection<T extends object>(
  name: string,
  indices: (keyof T)[]
): Collection<T> {
  return (
    db.getCollection<T>(name) ??
    db.addCollection<T>(name, { indices })
  );
}

export function initDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Ensure data directory exists
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
    }

    const dbPath = path.join(config.dataDir, 'dispatch.db.json');

    db = new Loki(dbPath, {
      autosave: true,
      autosaveInterval: 5000,
      autoload: true,
      autoloadCallback: (err?: Error) => {
        if (err) {
          reject(err);
          return;
        }

        requests = resolveCollection<RequestDocument>('requests', [
          'id' as keyof RequestDocument,
          'collectionId' as keyof RequestDocument,
          'folderId' as keyof RequestDocument,
        ]);
        collections = resolveCollection<CollectionDocument>('collections', [
          'id' as keyof CollectionDocument,
        ]);
        environments = resolveCollection<EnvironmentDocument>('environments', [
          'id' as keyof EnvironmentDocument,
        ]);
        history = resolveCollection<HistoryDocument>('history', [
          'id' as keyof HistoryDocument,
          'timestamp' as keyof HistoryDocument,
        ]);

        dbReady = true;
        for (const cb of readyCallbacks) cb();
        readyCallbacks.length = 0;

        resolve();
      },
    });
  });
}

export function closeDatabase(): Promise<void> {
  return new Promise((resolve) => {
    if (!db) {
      resolve();
      return;
    }
    db.close(() => resolve());
  });
}

export function waitForDb(): Promise<void> {
  return new Promise((resolve) => onReady(resolve));
}

export function getRequests(): Collection<RequestDocument> {
  return requests;
}

export function getCollections(): Collection<CollectionDocument> {
  return collections;
}

export function getEnvironments(): Collection<EnvironmentDocument> {
  return environments;
}

export function getHistory(): Collection<HistoryDocument> {
  return history;
}
