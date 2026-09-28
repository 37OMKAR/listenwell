const BT = /bluetooth|headset|hands-?free|airpods|buds|\bbt\b/i;

export async function ensureMicPermission(): Promise<void> {
  const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
  tmp.getTracks().forEach((t) => t.stop());
}

export async function listDevices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    inputs: all.filter((d) => d.kind === 'audioinput'),
    outputs: all.filter((d) => d.kind === 'audiooutput'),
  };
}

export async function pickPhoneMic(): Promise<string | undefined> {
  const { inputs } = await listDevices();
  const builtIn =
    inputs.find((d) => !BT.test(d.label) && d.deviceId !== 'default') ??
    inputs.find((d) => !BT.test(d.label));
  return builtIn?.deviceId ?? inputs[0]?.deviceId;
}

export function looksLikeBluetooth(label: string) {
  return BT.test(label);
}
