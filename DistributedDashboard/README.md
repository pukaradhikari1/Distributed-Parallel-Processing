# Distributed Processing Dashboard — RN Screens

Bare React Native CLI, TypeScript, Zustand, React Native Paper, Victory Native.
Built as a drop-in `src/` (+ root `App.tsx`) for your existing project.

## What's included

```
App.tsx
src/
  types/index.ts              shared domain types
  theme/theme.ts               dark dashboard theme + status colors
  services/apiClient.ts        ClusterApi interface + mock backend (swap for gRPC)
  store/useAuthStore.ts        login/register/logout, persisted via AsyncStorage
  store/useClusterStore.ts     workers, master, workloads, outputs, errors, polling
  navigation/types.ts          RootStackParamList / MainTabParamList
  navigation/RootNavigator.tsx auth-gated stack (Login/Register vs MainTabs + detail screens)
  navigation/MainTabNavigator.tsx bottom tabs: Dashboard, Submit, Output, Errors
  components/StatusChip.tsx
  components/ResourceBar.tsx
  components/ResourceDonut.tsx     Victory Native donut gauge (CPU/GPU/RAM)
  components/WorkerCard.tsx
  components/EmptyState.tsx
  screens/LoginScreen.tsx
  screens/RegisterScreen.tsx
  screens/DashboardScreen.tsx      master summary + worker list
  screens/WorkerDetailScreen.tsx   CPU/GPU/RAM gauges, active tasks, worker errors
  screens/MasterNodeScreen.tsx     orchestrator status + throughput line chart
  screens/WorkloadInputScreen.tsx  submit workload form + recent submissions
  screens/OutputScreen.tsx         processed output list + detail modal
  screens/ErrorLogScreen.tsx       worker error feed, severity filters
  screens/ReassignmentScreen.tsx   pick failed/stuck workload → same or different worker
```

## 1. Install dependencies

```bash
npm install zustand @react-native-async-storage/async-storage \
  react-native-paper react-native-vector-icons \
  @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs \
  react-native-screens react-native-safe-area-context react-native-gesture-handler \
  victory-native react-native-svg
```

Android setup for vector icons — add to `android/app/build.gradle`:
```gradle
apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")
```

`react-native-svg` and `react-native-gesture-handler` autolink on RN ≥0.71. If you're on an
older bare CLI setup, run `npx pod-install` is iOS-only — on Android just rebuild:
```bash
cd android && ./gradlew clean && cd ..
npx react-native run-android
```

## 2. Wire up your gRPC backend

Everything in the UI talks to the `ClusterApi` interface in `src/services/apiClient.ts` —
not to gRPC directly. Right now `clusterApi` points at `mockClusterApi`, which fakes a live
6-worker cluster so you can run the whole app today.

**Important:** plain `@grpc/grpc-js` does not run in React Native (no Node `http2`). With
your 4 existing `.proto` files (auth, worker, master, workload) you have two realistic paths:

- **grpc-web** (`@improbable-eng/grpc-web` or Connect-Web) talking to an Envoy/FastAPI
  gateway that terminates gRPC-Web → gRPC. This is the path of least resistance if your
  orchestrator is already FastAPI-fronted.
- **A native gRPC bridge** (e.g. `react-native-grpc`) if you need true on-device HTTP/2
  streaming (e.g. for live heartbeat/error streams instead of polling).

Once you have generated client stubs from your proto files, implement a `GrpcClusterApi
implements ClusterApi` class and swap the final export:

```ts
export const clusterApi: ClusterApi = new GrpcClusterApi(channel);
```

No screen or store code needs to change.

## 3. Notes

- Polling: `useClusterStore.startPolling()` refreshes workers + master status every 5s.
  Replace with a gRPC server-streaming subscription when ready — just call the same
  `set({...})` updates inside the stream's `onMessage` handler instead of on an interval.
- Auth token is persisted with AsyncStorage under key `dpdash.auth`. Swap for secure storage
  (e.g. `react-native-keychain`) before shipping.
- Reassignment screen surfaces workloads that are `failed`, `queued`, or stuck `processing`
  on a given source worker (passed in via navigation params from WorkerDetail/ErrorLog), and
  lets you retry on the same worker or pick a different online worker, showing live CPU/RAM
  load to help you choose.
