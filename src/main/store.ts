import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { DEFAULT_SETTINGS, createDailyStats, createSnapshot } from "../shared/defaults";
import type { DailyStats, EngineSnapshot, Settings } from "../shared/types";

interface StatsFile {
  version: 1;
  days: Record<string, DailyStats>;
}

interface IntegrationFile {
  version: 1;
  token: string;
}

export class LocalStore {
  private readonly settingsPath: string;
  private readonly sessionPath: string;
  private readonly statsPath: string;
  private readonly integrationPath: string;

  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
    this.settingsPath = join(root, "settings.json");
    this.sessionPath = join(root, "session.json");
    this.statsPath = join(root, "stats.json");
    this.integrationPath = join(root, "integration.json");
  }

  loadSettings(): Settings {
    const loaded = this.readJson<Partial<Settings>>(this.settingsPath, {});
    return this.validateSettings({ ...DEFAULT_SETTINGS, ...loaded, version: 1 });
  }

  saveSettings(settings: Settings): void {
    this.atomicWrite(this.settingsPath, settings);
  }

  loadSnapshot(now: number): EngineSnapshot {
    const loaded = this.readJson<EngineSnapshot | null>(this.sessionPath, null);
    if (!loaded || loaded.version !== 1) {
      return createSnapshot(now);
    }
    return loaded;
  }

  saveSnapshot(snapshot: EngineSnapshot): void {
    this.atomicWrite(this.sessionPath, snapshot);
  }

  loadStats(date: string): DailyStats {
    const file = this.readJson<StatsFile>(this.statsPath, { version: 1, days: {} });
    return file.days[date] ?? createDailyStats(date);
  }

  saveStats(stats: DailyStats): void {
    const file = this.readJson<StatsFile>(this.statsPath, { version: 1, days: {} });
    file.days[stats.date] = stats;
    this.atomicWrite(this.statsPath, file);
  }

  clearStats(): void {
    this.atomicWrite(this.statsPath, { version: 1, days: {} } satisfies StatsFile);
  }

  getIntegrationToken(): string {
    const loaded = this.readJson<IntegrationFile | null>(this.integrationPath, null);
    if (loaded?.version === 1 && loaded.token.length >= 32) {
      return loaded.token;
    }
    const value: IntegrationFile = {
      version: 1,
      token: randomBytes(32).toString("hex"),
    };
    this.atomicWrite(this.integrationPath, value);
    return value.token;
  }

  private validateSettings(settings: Settings): Settings {
    return {
      ...settings,
      workMinutes: clamp(settings.workMinutes, 10, 180),
      breakMinutes: clamp(settings.breakMinutes, 1, 30),
      idleMinutes: clamp(settings.idleMinutes, 1, 30),
      retryMinutes: clamp(settings.retryMinutes, 1, 30),
      maxRetries: clamp(settings.maxRetries, 0, 10),
    };
  }

  private readJson<T>(path: string, fallback: T): T {
    if (!existsSync(path)) {
      return structuredClone(fallback);
    }
    try {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch {
      const backup = `${path}.corrupt-${Date.now()}`;
      try {
        copyFileSync(path, backup);
      } catch {
        // Recovery should never prevent the reminder from starting.
      }
      return structuredClone(fallback);
    }
  }

  private atomicWrite(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
