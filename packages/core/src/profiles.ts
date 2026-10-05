import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute } from "node:path";
import type { Profile, ProfileInput, Server } from "@ld/shared";
import { logFile, profilesFile } from "./paths.js";
import { validPort } from "./ports.js";

/** Unpinned auto-captured profiles not seen for this long are dropped. */
const STALE_MS = 14 * 24 * 60 * 60 * 1000;
/** Don't rewrite profiles.json on every poll just to bump lastSeen. */
const SEEN_GRANULARITY_MS = 60 * 1000;

export async function loadProfiles(): Promise<Profile[]> {
  try {
    const data = JSON.parse(await readFile(profilesFile(), "utf8"));
    return Array.isArray(data.profiles) ? data.profiles : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export async function saveProfiles(profiles: Profile[]): Promise<void> {
  const file = profilesFile();
  await mkdir(dirname(file), { recursive: true });
  // Write-then-rename so a concurrent reader never sees a half-written file.
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ version: 1, profiles }, null, 2) + "\n");
  await rename(tmp, file);
}

const newId = () => randomUUID().slice(0, 8);

let queue: Promise<unknown> = Promise.resolve();

/**
 * Serialize load-modify-save cycles. Without this the 2s poll's sync can load
 * before an edit is saved and then overwrite it with the stale list.
 */
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/** Whether a server is worth remembering as a new profile. */
function capturable(s: Server): boolean {
  return !s.hidden && s.framework !== "docker" && !!s.cwd && s.cwd !== "/" && !s.daemon;
}

/**
 * Match running servers to profiles (setting `server.profileId`), capture new
 * ones, refresh auto-captured commands and prune stale ones. Pure apart from
 * mutating `servers`; returns the new profile list.
 */
export function reconcile(
  profiles: Profile[],
  servers: Server[],
  now: number,
): { profiles: Profile[]; changed: boolean } {
  let changed = false;
  const next = profiles.map((p) => ({ ...p }));

  for (const s of servers) {
    if (!s.cwd) continue;
    let p =
      next.find((p) => p.cwd === s.cwd && p.port === s.port) ??
      // Port-less profiles can only be matched by what they run.
      next.find((p) => p.port === undefined && p.cwd === s.cwd && p.command === s.launch);
    if (!p) {
      if (!capturable(s)) continue;
      const base = basename(s.cwd);
      p = {
        id: newId(),
        name: next.some((o) => o.name === base) ? `${base} :${s.port}` : base,
        command: s.launch,
        cwd: s.cwd,
        env: {},
        port: s.port,
        framework: s.framework,
        autoCaptured: true,
        pinned: false,
        createdAt: now,
        lastSeen: now,
      };
      next.push(p);
      changed = true;
    }
    s.profileId = p.id;
    if (!p.lastSeen || now - p.lastSeen >= SEEN_GRANULARITY_MS) {
      p.lastSeen = now;
      changed = true;
    }
    if (s.framework !== "unknown" && p.framework !== s.framework) {
      p.framework = s.framework;
      changed = true;
    }
    if (p.autoCaptured && !s.daemon && p.command !== s.launch) {
      p.command = s.launch;
      changed = true;
    }
  }

  const kept = next.filter((p) => p.pinned || !p.autoCaptured || now - (p.lastSeen ?? p.createdAt) < STALE_MS);
  return { profiles: kept, changed: changed || kept.length !== next.length };
}

/** Load, reconcile against `servers` and persist if anything changed. */
export function syncProfiles(servers: Server[], now = Date.now()): Promise<Profile[]> {
  return locked(async () => {
    const { profiles, changed } = reconcile(await loadProfiles(), servers, now);
    if (changed) await saveProfiles(profiles);
    return profiles;
  });
}

function validate(p: ProfileInput): void {
  if (!p.name.trim()) throw new Error("Name is required");
  if (!p.command.trim()) throw new Error("Command is required");
  if (!isAbsolute(p.cwd)) throw new Error("Working directory must be an absolute path");
  if (p.port !== undefined && !validPort(p.port)) {
    throw new Error("Port must be 1–65535");
  }
}

/** Create or edit a profile. Edited profiles become user-owned: auto-capture stops touching them. */
export function upsertProfile(input: ProfileInput): Promise<Profile> {
  validate(input);
  return locked(() => upsert(input));
}

async function upsert(input: ProfileInput): Promise<Profile> {
  const profiles = await loadProfiles();
  const fields = {
    name: input.name.trim(),
    command: input.command.trim(),
    cwd: input.cwd,
    env: input.env ?? {},
    port: input.port,
    pinned: input.pinned,
  };
  const i = input.id ? profiles.findIndex((p) => p.id === input.id) : -1;
  let profile: Profile;
  if (i >= 0) {
    profile = { ...profiles[i], ...fields, autoCaptured: false };
    profiles[i] = profile;
  } else {
    profile = { ...fields, id: newId(), autoCaptured: false, createdAt: Date.now() };
    profiles.push(profile);
  }
  await saveProfiles(profiles);
  return profile;
}

/** Write a profile exactly as given (insert or replace by id). */
export function saveProfile(profile: Profile): Promise<Profile> {
  return locked(async () => {
    const profiles = await loadProfiles();
    const i = profiles.findIndex((p) => p.id === profile.id);
    if (i >= 0) profiles[i] = profile;
    else profiles.push(profile);
    await saveProfiles(profiles);
    return profile;
  });
}

export function deleteProfile(id: string): Promise<void> {
  return locked(async () => {
    const profiles = await loadProfiles();
    await saveProfiles(profiles.filter((p) => p.id !== id));
    await rm(logFile(id), { force: true });
  });
}

export async function getProfile(id: string): Promise<Profile> {
  const p = (await loadProfiles()).find((p) => p.id === id);
  if (!p) throw new Error(`No profile ${id}`);
  return p;
}
