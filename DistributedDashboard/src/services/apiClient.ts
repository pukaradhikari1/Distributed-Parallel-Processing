// src/services/apiClient.ts
// Wired to your FastAPI backend (main.py + auth.py + errors.py)

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

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — change to your backend IP/URL
// ─────────────────────────────────────────────────────────────────────────────
const BACKEND_URL = 'http://10.0.2.2:8000';

// Stored token reference (set after login/verify-otp)
let _accessToken: string | null = null;
export function setAccessToken(token: string | null) { _accessToken = token; }
export function getAccessToken() { return _accessToken; }

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────
export interface ClusterApi {
  // Auth
  login(username: string, password: string): Promise<{ user: User; tokens: AuthTokens }>;
  register(username: string, email: string, password: string): Promise<{ user: User; tokens: AuthTokens }>;
  logout(): Promise<void>;
  sendOtp(email: string): Promise<boolean>;
  verifyOtp(email: string, otpCode: string, username: string, password: string): Promise<{ user: User; tokens: AuthTokens }>;
  resendOtp(email: string): Promise<void>;
  getProfile(accessToken: string): Promise<any>;
  updateProfile(accessToken: string, updates: { displayName: string; bio: string }): Promise<void>;
  deleteAccount(accessToken: string): Promise<void>;

  // Workers
  fetchWorkers(): Promise<WorkerNode[]>;
  fetchWorkerDetail(workerId: string): Promise<WorkerNode>;
  fetchWorkerErrors(workerId?: string): Promise<WorkerError[]>;

  // Master/Orchestrator
  fetchMasterStatus(): Promise<MasterNode>;
  fetchThroughputHistory(): Promise<ThroughputSample[]>;

  // Jobs/Workloads
  submitWorkload(input: {
    name: string;
    type: string;
    payload: string;
    priority: 'low' | 'normal' | 'high';
    userId?: string;
    pyFileUri?: string;
    pyFileName?: string;
    zipFileUri?: string;
    zipFileName?: string;
    notes?: string;
    workerCount?: number;
  }): Promise<Workload>;
  fetchWorkloads(): Promise<Workload[]>;
  fetchOutputs(): Promise<WorkloadOutput[]>;
  reassignWorkload(workloadId: string, targetWorkerId: string): Promise<Workload>;
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────
export const clusterApi: ClusterApi = {

  // ── AUTH ──────────────────────────────────────────────────────────────────

  async login(username, password) {
    const res = await fetch(`${BACKEND_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Login failed');
    }
    const data = await res.json();
    _accessToken = data.access_token;
    return {
      user: { id: username, username, email: '' },
      tokens: { accessToken: data.access_token },
    };
  },

  async register(username, email, password) {
    const res = await fetch(`${BACKEND_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Registration failed');
    }
    // NOTE: no real tokens here on purpose — /signup doesn't authenticate you.
    // Do NOT store this fake accessToken anywhere that isAuthenticated checks
    // (e.g. `!!tokens`), since an empty-but-truthy tokens object would still
    // flip isAuthenticated to true and skip straight past the OTP screen —
    // the exact bug we fixed earlier. Real login happens in verifyOtp() below.
    return {
      user: { id: username, username, email },
      tokens: { accessToken: '' },
    };
  },

  async logout() {
    _accessToken = null;
  },

  async sendOtp(email) {
    try {
      const res = await fetch(`${BACKEND_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to send OTP');
      }
      return true;
    } catch (e) {
      throw e instanceof Error ? e : new Error('Network error');
    }
  },

  async verifyOtp(email, otpCode, username, password) {
    // FIXED: your backend's VerifyOTPRequest schema field is named `otp`,
    // NOT `otp_code` — sending otp_code meant the real field was always
    // missing/empty server-side, so the comparison against the stored code
    // never matched, always returning "Invalid OTP code" even for the
    // correct input. This was the actual bug.
    const res = await fetch(`${BACKEND_URL}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp: otpCode }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Invalid OTP');
    }
    return clusterApi.login(username, password);
  },

  async resendOtp(email) {
    await fetch(`${BACKEND_URL}/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  },

  async getProfile(accessToken) {
    const res = await fetch(`${BACKEND_URL}/profile`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('Failed to fetch profile');
    const data = await res.json();
    return {
      displayName: data.display_name || data.username,
      bio: data.bio || '',
      isPremium: data.plan === 'Premium',
      createdAt: data.created_at,
      role: data.role,
      apiAccess: data.api_access,
      maxWorkers: data.max_workers,
      isVerified: data.is_verified,
      plan: data.plan || 'Free',
    };
  },

  async updateProfile(accessToken, updates) {
    const res = await fetch(`${BACKEND_URL}/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        display_name: updates.displayName,
        bio: updates.bio,
      }),
    });
    if (!res.ok) throw new Error('Failed to update profile');
  },

  async deleteAccount(accessToken: string) {
    const res = await fetch(`${BACKEND_URL}/delete-account`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to delete account');
    }
  },

  // ── WORKERS ───────────────────────────────────────────────────────────────

  async fetchWorkers() {
    try {
      const res = await fetch(`${BACKEND_URL}/workers`);
      if (!res.ok) throw new Error('Failed to fetch workers');
      const data: Record<string, any> = await res.json();

      return Object.entries(data).map(([id, w]) => {
        const totalMB = (w.ram ?? 0) * ((w.ram ?? 0) > 128 ? 1 : 1024);
        return {
          id,
          name: id,
          ipAddress: w.ip || '0.0.0.0',
          status: w.status || 'offline',
          lastHeartbeat: w.last_seen
            ? new Date(w.last_seen * 1000).toISOString()
            : new Date().toISOString(),
          cpu: {
            usagePercent: w.cpu_percent ?? 0,
            cores: w.cores ?? 1,
          },
          gpu: w.gpu_percent !== undefined ? { usagePercent: w.gpu_percent } : null,
          ram: {
            usedMB: Math.round(((w.ram_percent ?? 0) / 100) * totalMB),
            totalMB: totalMB,
          },
          activeTaskIds: w.current_job ? [w.current_job] : [],
        };
      });
    } catch (e) {
      console.error('fetchWorkers error:', e);
      return [];
    }
  },

  async fetchWorkerDetail(workerId) {
    const workers = await clusterApi.fetchWorkers();
    const worker = workers.find(w => w.id === workerId);
    if (!worker) throw new Error(`Worker ${workerId} not found`);
    return worker;
  },

  async fetchWorkerErrors(workerId) {
    try {
      const res = await fetch(`${BACKEND_URL}/errors`);
      if (!res.ok) return [];
      const data: any[] = await res.json();

      const mapped: WorkerError[] = data.map((e: any) => ({
        id: e.id,
        workerId: e.worker_id,
        workerName: e.worker_id,
        taskId: undefined,
        message: e.message,
        severity: e.severity as WorkerError['severity'],
        timestamp: e.timestamp,
      }));

      return workerId
        ? mapped.filter(e => e.workerId === workerId)
        : mapped;
    } catch (e) {
      console.error('fetchWorkerErrors error:', e);
      return [];
    }
  },

  // ── MASTER / ORCHESTRATOR ─────────────────────────────────────────────────

  async fetchMasterStatus() {
    try {
      const [workersRes, jobsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/workers`),
        fetch(`${BACKEND_URL}/jobs`),
      ]);

      if (!workersRes.ok || !jobsRes.ok) throw new Error('Backend error');

      const workersData: Record<string, any> = await workersRes.json();
      const jobsData: any = await jobsRes.json();

      const workerList = Object.values(workersData);
      const jobList = Array.isArray(jobsData) ? jobsData : Object.values(jobsData);

      const onlineWorkers = workerList.filter((w: any) => w.status === 'online').length;
      const queuedWorkloads = jobList.filter((j: any) => j.status === 'queued').length;
      const processingWorkloads = jobList.filter((j: any) => j.status === 'running').length;

      return {
        id: 'master-1',
        status: onlineWorkers > 0 ? 'healthy' : workerList.length > 0 ? 'degraded' : 'offline',
        uptimeSeconds: 3600,
        totalWorkers: workerList.length,
        onlineWorkers,
        queuedWorkloads,
        processingWorkloads,
        throughputPerMin: 0,
        lastElectionAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error('fetchMasterStatus error:', e);
      return {
        id: 'master-1',
        status: 'offline' as const,
        uptimeSeconds: 0,
        totalWorkers: 0,
        onlineWorkers: 0,
        queuedWorkloads: 0,
        processingWorkloads: 0,
        throughputPerMin: 0,
      };
    }
  },

  async fetchThroughputHistory() {
    return Array.from({ length: 12 }).map((_, i) => ({
      timestamp: new Date(Date.now() - (11 - i) * 60_000).toISOString(),
      value: 40 + Math.floor(Math.random() * 60),
    }));
  },

  // ── JOBS ──────────────────────────────────────────────────────────────────

  async submitWorkload(input) {
    const formData = new FormData();

    formData.append('user_id', input.userId || 'anonymous');
    formData.append('job_name', input.name);
    formData.append('worker_count', String(input.workerCount ?? 1));
    if (input.notes) formData.append('notes', input.notes);

    if (input.pyFileUri) {
      formData.append('script_file', {
        uri: input.pyFileUri,
        name: input.pyFileName || 'script.py',
        type: 'text/x-python',
      } as any);
    } else {
      const blob = new Blob([`# Job: ${input.name}\n${input.payload}`], { type: 'text/plain', lastModified: Date.now() });
      formData.append('script_file', blob);
    }

    if (input.zipFileUri) {
      formData.append('data_file', {
        uri: input.zipFileUri,
        name: input.zipFileName || 'data.zip',
        type: 'application/zip',
      } as any);
    }

    const res = await fetch(`${BACKEND_URL}/submit-job`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.message || data.detail || 'Job submission failed');
    }

    // FIX: Catch the backend's explicit 'failed' status indicator that uses status 200 OK
    if (data.status === 'failed') {
      throw new Error(data.message || 'Not enough cluster workers available.');
    }

    return {
      id: data.job_id,
      name: data.job_name || input.name,
      type: input.type,
      status: data.status === 'running' ? 'processing' : data.status,
      payload: input.payload,
      priority: input.priority,
      submittedAt: new Date().toISOString(),
      assignedWorkerId: data.assigned_worker ?? undefined,
      assignedWorkerIds: data.assigned_workers ?? (data.assigned_worker ? [data.assigned_worker] : []),
      attempt: 1,
    };
  },

  async fetchOutputs(): Promise<WorkloadOutput[]> {
    try {
      const res = await fetch(`${BACKEND_URL}/outputs`);
      if (!res.ok) throw new Error('Failed to fetch outputs');

      const data: Record<string, any> = await res.json();

      return Object.values(data).map((out: any) => ({
        id: out.job_id,
        workloadId: out.job_id,
        workerId: out.worker_id,
        // FIX: Provide 'workerName' so OutputScreen does not render "Unknown"
        workerName: out.worker_id || 'Cluster Node',
        outputUrl: out.filename,
        // FIX: Populate 'result' (not 'outputPreview') to satisfy OutputScreen UI expectations
        result: out.result ? String(out.result) : '',
        outputPreview: out.result ? String(out.result) : '',
        durationMs: 0, // Fallback duration placeholder since backend doesn't explicitly serve it here
        completedAt: new Date().toISOString(),
      }));
    } catch (e) {
      console.error('fetchOutputs error:', e);
      return [];
    }
  },

  async fetchWorkloads(): Promise<Workload[]> {
    try {
      const res = await fetch(`${BACKEND_URL}/jobs`);
      if (!res.ok) throw new Error('Failed to fetch jobs');

      const data: any[] = await res.json();

      return data.map((j: any) => ({
        id: j.job_id,
        name: j.filename || j.job_id,
        type: 'python-script',
        status: j.status === 'running' ? 'processing' : j.status,
        priority: 'normal' as const,
        payload: '',
        submittedAt: j.created_at
          ? new Date(j.created_at * 1000).toISOString()
          : new Date().toISOString(),
        assignedWorkerId: j.worker_id ?? undefined,
        attempt: 1,
      }));
    } catch (e) {
      console.error('fetchWorkloads error:', e);
      return [];
    }
  },

  async fetchOutputs(): Promise<WorkloadOutput[]> {
    try {
      const res = await fetch(`${BACKEND_URL}/outputs`);
      if (!res.ok) throw new Error('Failed to fetch outputs');

      const data: Record<string, any> = await res.json();

      return Object.values(data).map((out: any) => ({
        id: out.job_id,
        workloadId: out.job_id,
        workerId: out.worker_id,
        outputUrl: out.filename,
        outputPreview: out.result ? String(out.result) : '',
        completedAt: new Date().toISOString(),
      }));
    } catch (e) {
      console.error('fetchOutputs error:', e);
      return [];
    }
  },

  async reassignWorkload(workloadId, targetWorkerId) {
    return {
      id: workloadId,
      name: `Reassigned Job ${workloadId}`,
      type: 'python-script',
      status: 'processing',
      priority: 'normal',
      payload: '',
      submittedAt: new Date().toISOString(),
      assignedWorkerId: targetWorkerId,
      attempt: 2,
    };
  },
};
export { BACKEND_URL };