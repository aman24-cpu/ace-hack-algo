import algosdk from "algosdk";

const ALGOD_SERVER = "https://testnet-api.algonode.cloud";
const ALGOD_PORT = "";
const ALGOD_TOKEN = "";
export const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);

export const safeGetAddress = (data: any): string | null => {
  if (!data) return null;
  try {
    if (typeof data === 'string') {
      if (data.length === 58) return data;
      if (data.length >= 40 && data.length <= 45) {
        try {
          return algosdk.encodeAddress(Buffer.from(data, 'base64'));
        } catch { return null; }
      }
    }
    if (data instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(data))) {
      return algosdk.encodeAddress(new Uint8Array(data));
    }
    if (typeof data === 'object' && data !== null) {
      const raw = data.publicKey || data.pk || data.addr || data.snd || data.rcv || data.arcv;
      return safeGetAddress(raw);
    }
    return null;
  } catch (e) {
    return null;
  }
};
