import FingerprintJS from "@fingerprintjs/fingerprintjs";

// Initialize an agent at application startup.
const fpPromise = FingerprintJS.load();
export async function createUUID() {
  const fp = await fpPromise;
  const result = await fp.get();
  return result.visitorId;

  if (typeof crypto === "object") {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (
      typeof crypto.getRandomValues === "function" &&
      typeof Uint8Array === "function"
    ) {
      const callback = (c: string) => {
        const num = Number(c);
        return (
          num ^
          (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (num / 4)))
        ).toString(16);
      };
      // @ts-ignore
      return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, callback);
    }
  }
  let timestamp = new Date().getTime();
  let perforNow =
    (typeof performance !== "undefined" &&
      performance.now &&
      performance.now() * 1000) ||
    0;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    let random = Math.random() * 16;
    if (timestamp > 0) {
      // eslint-disable-next-line no-bitwise
      random = (timestamp + random) % 16 | 0;
      timestamp = Math.floor(timestamp / 16);
    } else {
      // eslint-disable-next-line no-bitwise
      random = (perforNow + random) % 16 | 0;
      perforNow = Math.floor(perforNow / 16);
    }
    // eslint-disable-next-line no-bitwise
    return (c === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}
