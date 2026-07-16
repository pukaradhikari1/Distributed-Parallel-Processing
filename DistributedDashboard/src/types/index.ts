// src/types/index.ts
// Shared domain types for the distributed processing dashboard.
// Keep these aligned with your .proto definitions (auth, worker, master, workload).

export type WorkerStatus = 'online' | 'idle' | 'busy' | 'offline' | 'error';
export type WorkloadStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'reassigned';
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type MasterStatus = 'healthy' | 'degraded' | 'down';

export interface User {
  id: string;
  username: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface CpuInfo {
  usagePercent: number; // 0-100
  cores: number;
  model?: string;
}

export interface GpuInfo {
  usagePercent: number; // 0-100
  model?: string;
  vramUsedMB?: number;
  vramTotalMB?: number;
}

export interface RamInfo {
  usedMB: number;
  totalMB: number;
}

export interface WorkerNode {
  id: string;
  name: string;
  ipAddress: string;
  status: WorkerStatus;
  lastHeartbeat: string; // ISO timestamp
  cpu: CpuInfo;
  gpu: GpuInfo | null; // null if worker has no GPU
  ram: RamInfo;
  activeTaskIds: string[];
  region?: string;
}

export interface MasterNode {
  id: string;
  status: MasterStatus;
  uptimeSeconds: number;
  totalWorkers: number;
  onlineWorkers: number;
  queuedWorkloads: number;
  processingWorkloads: number;
  throughputPerMin: number;
  lastElectionAt?: string;
}

export interface ThroughputSample {
  timestamp: string;
  value: number;
}

export interface Workload {
  id: string;
  name: string;
  type: string;
  payload: string;
  priority: 'low' | 'normal' | 'high';
  status: WorkloadStatus;
  assignedWorkerId?: string;
  submittedAt: string;
  startedAt?: string;
  completedAt?: string;
  attempt: number;
}

export interface WorkloadOutput {
  id: string;
  workloadId: string;
  workerName: string;
  durationMs: number;
  completedAt: string;
  result: string;          // raw text/log — always present
  taskType?: string;       // optional hint from backend: 'ml' | 'script' | 'data' | etc.
}

export interface WorkerError {
  id: string;
  workerId: string;
  workerName: string;
  taskId?: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: string;
}
