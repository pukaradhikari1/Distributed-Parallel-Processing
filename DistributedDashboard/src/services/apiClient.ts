// src/services/apiClient.ts

import {
  AuthTokens,
  MasterNode,
  ThroughputSample,
  User,
  WorkerError,
  WorkerNode,
  Workload,
  WorkloadOutput,
} from '../types';

export interface UserProfileData {
  avatarUrl?: string;
  displayName?: string;
  bio?: string;
  isPremium: boolean;
  createdAt: string; // ISO string
}

export interface ClusterApi {
  // --- auth.proto ---
  login(username: string, password: string): Promise<{ user: User; tokens: AuthTokens }>;
  register(username: string, email: string, password: string): Promise<{ user: User; tokens: AuthTokens }>;
  logout(): Promise<void>;
  getProfile(accessToken: string): Promise<UserProfileData>;
  updateProfile(updates: Partial<Omit<UserProfileData, 'createdAt' | 'isPremium'>>): Promise<void>;
  deleteAccount(): Promise<void>;

  // --- worker.proto ---
  fetchWorkers(): Promise<WorkerNode[]>;
  fetchWorkerDetail(workerId: string): Promise<WorkerNode>;
  fetchWorkerErrors(workerId?: string): Promise<WorkerError[]>;

  // --- master.proto ---
  fetchMasterStatus(): Promise<MasterNode>;
  fetchThroughputHistory(): Promise<ThroughputSample[]>;

  // --- workload.proto ---
  submitWorkload(input: Pick<Workload, 'name' | 'type' | 'payload' | 'priority'>): Promise<Workload>;
  fetchWorkloads(): Promise<Workload[]>;
  fetchOutputs(): Promise<WorkloadOutput[]>;
  reassignWorkload(workloadId: string, targetWorkerId: string): Promise<Workload>;
}

// ---------------------------------------------------------------------------
// Mock implementation
// ---------------------------------------------------------------------------

const delay = (ms: number) => new Promise<void>(res => setTimeout(() => res(), ms));
const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
const uid = () => Math.random().toString(36).slice(2, 10);

let mockProfile: UserProfileData = {
  displayName: '',
  bio: '',
  avatarUrl: undefined,
  isPremium: false,
  createdAt: new Date().toISOString(),
};

let mockWorkers: WorkerNode[] = Array.from({ length: 6 }).map((_, i) => ({
  id: `worker-${i + 1}`,
  name: `worker-${i + 1}`,
  ipAddress: `10.0.0.${10 + i}`,
  status: (['online', 'busy', 'idle', 'online', 'error', 'offline'] as const)[i],
  lastHeartbeat: new Date().toISOString(),
  cpu: { usagePercent: rand(10, 95), cores: 8 },
  gpu: i % 2 === 0 ? { usagePercent: rand(5, 90), model: 'NVIDIA T4', vramUsedMB: rand(1000, 14000), vramTotalMB: 16000 } : null,
  ram: { usedMB: rand(2000, 15000), totalMB: 16000 },
  activeTaskIds: i % 3 === 0 ? [uid(), uid()] : [],
}));

let mockWorkloads: Workload[] = [];
let mockOutputs: WorkloadOutput[] = [];
let mockErrors: WorkerError[] = [
  {
    id: uid(),
    workerId: 'worker-5',
    workerName: 'worker-5',
    message: 'Heartbeat timeout after 30s — connection reset by peer',
    severity: 'high',
    timestamp: new Date().toISOString(),
  },
];
let throughputHistory: ThroughputSample[] = Array.from({ length: 12 }).map((_, i) => ({
  timestamp: new Date(Date.now() - (11 - i) * 60000).toISOString(),
  value: rand(20, 120),
}));

export const mockClusterApi: ClusterApi = {
  async login(username, password) {
    await delay(500);
    if (!username || !password) throw new Error('Username and password are required');
    mockProfile = {
      displayName: username,
      bio: '',
      isPremium: false,
      createdAt: new Date().toISOString(),
    };
    return {
      user: { id: uid(), username, email: `${username}@example.com` },
      tokens: { accessToken: `mock-${uid()}` },
    };
  },

  async register(username, email, password) {
    await delay(600);
    if (!username || !email || !password) throw new Error('All fields are required');
    mockProfile = {
      displayName: username,
      bio: '',
      isPremium: false,
      createdAt: new Date().toISOString(),
    };
    return {
      user: { id: uid(), username, email },
      tokens: { accessToken: `mock-${uid()}` },
    };
  },

  async logout() {
    await delay(150);
  },

  async getProfile(_accessToken) {
    await delay(200);
    return { ...mockProfile };
  },

  async updateProfile(updates) {
    await delay(300);
    mockProfile = { ...mockProfile, ...updates };
  },

  async deleteAccount() {
    await delay(400);
    mockProfile = { displayName: '', bio: '', isPremium: false, createdAt: '' };
  },

  async fetchWorkers() {
    await delay(300);
    mockWorkers = mockWorkers.map(w => ({
      ...w,
      cpu: { ...w.cpu, usagePercent: clamp(w.cpu.usagePercent + rand(-8, 8)) },
      ram: { ...w.ram, usedMB: clamp(w.ram.usedMB + rand(-500, 500), 0, w.ram.totalMB) },
      gpu: w.gpu ? { ...w.gpu, usagePercent: clamp(w.gpu.usagePercent + rand(-10, 10)) } : null,
      lastHeartbeat: w.status !== 'offline' ? new Date().toISOString() : w.lastHeartbeat,
    }));
    return mockWorkers;
  },

  async fetchWorkerDetail(workerId) {
    await delay(250);
    const worker = mockWorkers.find(w => w.id === workerId);
    if (!worker) throw new Error('Worker not found');
    return worker;
  },

  async fetchWorkerErrors(workerId) {
    await delay(250);
    return workerId ? mockErrors.filter(e => e.workerId === workerId) : mockErrors;
  },

  async fetchMasterStatus() {
    await delay(250);
    const online = mockWorkers.filter(w => w.status !== 'offline').length;
    return {
      id: 'master-1',
      status: online >= mockWorkers.length - 1 ? 'healthy' : 'degraded',
      uptimeSeconds: 60 * 60 * 13 + 245,
      totalWorkers: mockWorkers.length,
      onlineWorkers: online,
      queuedWorkloads: mockWorkloads.filter(w => w.status === 'queued').length,
      processingWorkloads: mockWorkloads.filter(w => w.status === 'processing').length,
      throughputPerMin: throughputHistory[throughputHistory.length - 1]?.value ?? 0,
    };
  },

  async fetchThroughputHistory() {
    await delay(200);
    return throughputHistory;
  },

  async submitWorkload(input) {
    await delay(400);
    const target = mockWorkers.find(w => w.status === 'online' || w.status === 'idle');
    const workload: Workload = {
      id: uid(),
      ...input,
      status: target ? 'processing' : 'queued',
      assignedWorkerId: target?.id,
      submittedAt: new Date().toISOString(),
      startedAt: target ? new Date().toISOString() : undefined,
      attempt: 1,
    };
    mockWorkloads = [workload, ...mockWorkloads];

    setTimeout(() => {
      const idx = mockWorkloads.findIndex(w => w.id === workload.id);
      if (idx === -1) return;
      const success = Math.random() > 0.2;
      if (success) {
        mockWorkloads[idx] = { ...mockWorkloads[idx], status: 'completed', completedAt: new Date().toISOString() };
        mockOutputs = [
          {
            id: uid(),
            workloadId: workload.id,
            workerId: workload.assignedWorkerId ?? 'unknown',
            workerName: workload.assignedWorkerId ?? 'unknown',
            result: `Processed "${workload.name}" (${workload.type}) successfully.`,
            durationMs: rand(400, 4000),
            completedAt: new Date().toISOString(),
          },
          ...mockOutputs,
        ];
      } else {
        mockWorkloads[idx] = { ...mockWorkloads[idx], status: 'failed' };
        mockErrors = [
          {
            id: uid(),
            workerId: workload.assignedWorkerId ?? 'unknown',
            workerName: workload.assignedWorkerId ?? 'unknown',
            taskId: workload.id,
            message: `Task ${workload.id} crashed: unhandled exception in handler`,
            severity: 'high',
            timestamp: new Date().toISOString(),
          },
          ...mockErrors,
        ];
      }
    }, 3500);

    return workload;
  },

  async fetchWorkloads() {
    await delay(250);
    return mockWorkloads;
  },

  async fetchOutputs() {
    await delay(250);
    return mockOutputs;
  },

  async reassignWorkload(workloadId, targetWorkerId) {
    await delay(400);
    const idx = mockWorkloads.findIndex(w => w.id === workloadId);
    if (idx === -1) throw new Error('Workload not found');
    mockWorkloads[idx] = {
      ...mockWorkloads[idx],
      status: 'processing',
      assignedWorkerId: targetWorkerId,
      attempt: mockWorkloads[idx].attempt + 1,
      startedAt: new Date().toISOString(),
      completedAt: undefined,
    };
    return mockWorkloads[idx];
  },
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export const clusterApi: ClusterApi = mockClusterApi;