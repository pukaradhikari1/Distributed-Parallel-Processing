// src/navigation/types.ts
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  OTP: {                   // ← NEW
    email: string;
    username: string;
    password: string;
  };
  MainTabs: undefined;
  WorkerDetail: { workerId: string };
  MasterNode: undefined;
  Reassignment: { workloadId?: string; sourceWorkerId?: string } | undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  WorkloadInput: undefined;
  Output: undefined;
  Errors: undefined;
  Profile: undefined;
};