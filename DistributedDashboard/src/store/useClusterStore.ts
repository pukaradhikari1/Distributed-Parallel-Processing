// src/store/useClusterStore.ts
import { create } from 'zustand';
import { clusterApi } from '../services/apiClient';
import { useAuthStore } from './useAuthStore';
import {
  MasterNode,
  ThroughputSample,
  WorkerError,
  WorkerNode,
  Workload,
  WorkloadOutput,
} from '../types';

interface ClusterState {
  workers: WorkerNode[];
  master: MasterNode | null;
  throughputHistory: ThroughputSample[];
  workloads: Workload[];
  outputs: WorkloadOutput[];
  errors: WorkerError[];
  isLoading: boolean;
  error: string | null;
  pollHandle: ReturnType<typeof setInterval> | null;

  fetchWorkers: () => Promise<void>;
  fetchMasterStatus: () => Promise<void>;
  fetchWorkloads: () => Promise<void>;
  fetchOutputs: () => Promise<void>;
  fetchErrors: (workerId?: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  submitWorkload: (input: {
    name: string;
    type: string;
    payload: string;
    priority: 'low' | 'normal' | 'high';
    pyFileUri?: string;
    pyFileName?: string;
    zipFileUri?: string;
    zipFileName?: string;
    notes?: string;
    workerCount?: number;
  }) => Promise<Workload | null>;
  reassignWorkload: (workloadId: string, targetWorkerId: string) => Promise<boolean>;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
}

export const useClusterStore = create<ClusterState>((set, get) => ({
  workers: [],
  master: null,
  throughputHistory: [],
  workloads: [],
  outputs: [],
  errors: [],
  isLoading: false,
  error: null,
  pollHandle: null,

  fetchWorkers: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await clusterApi.fetchWorkers();
      set({ workers: data, isLoading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Failed to fetch workers',
        isLoading: false,
      });
    }
  },

  fetchMasterStatus: async () => {
    try {
      const [status, history] = await Promise.all([
        clusterApi.fetchMasterStatus(),
        clusterApi.fetchThroughputHistory(),
      ]);
      set({ master: status, throughputHistory: history });
    } catch (e) {
      console.error('fetchMasterStatus failed', e);
    }
  },

  fetchWorkloads: async () => {
    set({ isLoading: true, error: null });
    try {
      const list = await clusterApi.fetchWorkloads();
      set({ workloads: list, isLoading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Failed to fetch workloads',
        isLoading: false,
      });
    }
  },

  fetchOutputs: async () => {
    try {
      const outputs = await clusterApi.fetchOutputs();
      set({ outputs });
    } catch (e) {
      console.error('fetchOutputs error:', e);
    }
  },

  fetchErrors: async workerId => {
    try {
      const errors = await clusterApi.fetchWorkerErrors(workerId);
      set({ errors });
    } catch (e) {
      console.error('fetchErrors error:', e);
    }
  },

  refreshAll: async () => {
    set({ isLoading: true, error: null });
    try {
      await Promise.all([
        get().fetchWorkers(),
        get().fetchMasterStatus(),
        get().fetchWorkloads(),
        get().fetchOutputs(),
        get().fetchErrors(),
      ]);
    } catch (e) {
      console.error('refreshAll error', e);
    } finally {
      set({ isLoading: false });
    }
  },

  // workerCount now flows straight through to clusterApi.submitWorkload,
  // alongside the userId already pulled from useAuthStore.
  submitWorkload: async input => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      set({ error: 'You must be logged in to submit a job' });
      return null;
    }

    try {
      const workload = await clusterApi.submitWorkload({ ...input, userId });
      set({ workloads: [workload, ...get().workloads] });

      // Warm poll for visual updates as backend processes script
      setTimeout(() => {
        get().fetchWorkloads();
        get().fetchOutputs();
        get().fetchErrors();
        get().fetchWorkers();
      }, 4000);
      return workload;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to submit workload' });
      return null;
    }
  },

  reassignWorkload: async (workloadId, targetWorkerId) => {
    try {
      const updated = await clusterApi.reassignWorkload(workloadId, targetWorkerId);
      set({
        workloads: get().workloads.map(w => (w.id === updated.id ? updated : w)),
      });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to reassign workload' });
      return false;
    }
  },

  startPolling: (intervalMs = 5000) => {
    get().stopPolling();
    const handle = setInterval(() => {
      get().fetchWorkers();
      get().fetchMasterStatus();
    }, intervalMs);
    set({ pollHandle: handle });
  },

  stopPolling: () => {
    const handle = get().pollHandle;
    if (handle) {
      clearInterval(handle);
      set({ pollHandle: null });
    }
  },
}));