// src/store/useClusterStore.ts
import { create } from 'zustand';
import { clusterApi } from '../services/apiClient';
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
  submitWorkload: (input: { name: string; type: string; payload: string; priority: 'low' | 'normal' | 'high' }) => Promise<Workload | null>;
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
    try {
      const workers = await clusterApi.fetchWorkers();
      set({ workers });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch workers' });
    }
  },

  fetchMasterStatus: async () => {
    try {
      const [master, throughputHistory] = await Promise.all([
        clusterApi.fetchMasterStatus(),
        clusterApi.fetchThroughputHistory(),
      ]);
      set({ master, throughputHistory });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch master status' });
    }
  },

  fetchWorkloads: async () => {
    try {
      const workloads = await clusterApi.fetchWorkloads();
      set({ workloads });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch workloads' });
    }
  },

  fetchOutputs: async () => {
    try {
      const outputs = await clusterApi.fetchOutputs();
      set({ outputs });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch outputs' });
    }
  },

  fetchErrors: async workerId => {
    try {
      const errors = await clusterApi.fetchWorkerErrors(workerId);
      set({ errors });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch errors' });
    }
  },

  refreshAll: async () => {
    set({ isLoading: true, error: null });
    await Promise.all([
      get().fetchWorkers(),
      get().fetchMasterStatus(),
      get().fetchWorkloads(),
      get().fetchOutputs(),
      get().fetchErrors(),
    ]);
    set({ isLoading: false });
  },

  submitWorkload: async input => {
    try {
      const workload = await clusterApi.submitWorkload(input);
      set({ workloads: [workload, ...get().workloads] });
      // poll for completion shortly after submit
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
    if (handle) clearInterval(handle);
    set({ pollHandle: null });
  },
}));
