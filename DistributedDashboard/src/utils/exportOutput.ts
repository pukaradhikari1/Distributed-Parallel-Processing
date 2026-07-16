// src/utils/exportOutput.ts
import RNFS from 'react-native-fs';
import { zip } from 'react-native-zip-archive';
import Share from 'react-native-share';
import { WorkloadOutput } from '../types';

// ── Metric detection ─────────────────────────────────────────────────────────
const ML_KEYS = [
    'loss', 'val_loss', 'accuracy', 'val_accuracy', 'acc', 'val_acc',
    'precision', 'recall', 'f1', 'f1_score', 'auc', 'mae', 'mse', 'rmse',
    'epoch', 'epochs', 'learning_rate', 'lr',
];

export function tryParseStructuredOutput(raw: string): Record<string, any> | null {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        // not JSON — treat as plain log/text output
    }
    return null;
}

export function isMlMetrics(data: Record<string, any> | null): boolean {
    if (!data) return false;
    return Object.keys(data).some(k => ML_KEYS.includes(k.toLowerCase()));
}

export function detectTaskType(output: WorkloadOutput, structured: Record<string, any> | null): 'ml' | 'generic' {
    if (output.taskType === 'ml') return 'ml';
    if (output.taskType && output.taskType !== 'ml') return 'generic';
    return isMlMetrics(structured) ? 'ml' : 'generic';
}

// ── ZIP export + share ───────────────────────────────────────────────────────
export async function exportOutputAsZip(
    output: WorkloadOutput,
    structured: Record<string, any> | null
): Promise<string> {
    const safeId = output.workloadId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = `${RNFS.CachesDirectoryPath}/output_${safeId}`;
    const zipPath = `${RNFS.CachesDirectoryPath}/output_${safeId}.zip`;

    // Clean up any previous export for this workload
    if (await RNFS.exists(dir)) await RNFS.unlink(dir);
    if (await RNFS.exists(zipPath)) await RNFS.unlink(zipPath);
    await RNFS.mkdir(dir);

    // 1. Always include the raw result/log
    await RNFS.writeFile(`${dir}/result.txt`, output.result ?? '', 'utf8');

    // 2. If it parsed as structured data (ML metrics or any JSON output), save separately too
    if (structured) {
        await RNFS.writeFile(`${dir}/metrics.json`, JSON.stringify(structured, null, 2), 'utf8');
    }

    // 3. Metadata for every task type
    const meta = {
        workloadId: output.workloadId,
        workerName: output.workerName,
        durationMs: output.durationMs,
        completedAt: output.completedAt,
        taskType: detectTaskType(output, structured),
    };
    await RNFS.writeFile(`${dir}/meta.json`, JSON.stringify(meta, null, 2), 'utf8');

    await zip(dir, zipPath);
    await RNFS.unlink(dir).catch(() => { });

    return zipPath;
}

export async function exportAndShareZip(
    output: WorkloadOutput,
    structured: Record<string, any> | null
): Promise<void> {
    const zipPath = await exportOutputAsZip(output, structured);
    const safeId = output.workloadId.replace(/[^a-zA-Z0-9_-]/g, '_');

    await Share.open({
        url: `file://${zipPath}`,
        type: 'application/zip',
        filename: `output_${safeId}`,
        failOnCancel: false,
    });
}