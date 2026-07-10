export interface ZipEntry {
  path: string;
  data: Uint8Array | string | (() => Promise<Uint8Array | string>);
  modifiedAt?: Date;
}

const encoder = new TextEncoder();

function toBytes(data: Uint8Array | string) {
  return typeof data === "string" ? encoder.encode(data) : data;
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let value = i;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[i] = value >>> 0;
}

function crc32(data: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of data) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function writeUInt16(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function buildEntryParts(entry: ZipEntry, data: Uint8Array, offset: number) {
  const path = entry.path.replace(/\\/g, "/").replace(/^\/+/, "");
  const name = encoder.encode(path);
  const checksum = crc32(data);
  const modified = dosTimestamp(entry.modifiedAt ?? new Date());

  const local = new Uint8Array(30 + name.length + data.length);
  writeUInt32(local, 0, 0x04034b50);
  writeUInt16(local, 4, 20);
  writeUInt16(local, 6, 0);
  writeUInt16(local, 8, 0);
  writeUInt16(local, 10, modified.time);
  writeUInt16(local, 12, modified.day);
  writeUInt32(local, 14, checksum);
  writeUInt32(local, 18, data.length);
  writeUInt32(local, 22, data.length);
  writeUInt16(local, 26, name.length);
  writeUInt16(local, 28, 0);
  local.set(name, 30);
  local.set(data, 30 + name.length);

  const central = new Uint8Array(46 + name.length);
  writeUInt32(central, 0, 0x02014b50);
  writeUInt16(central, 4, 20);
  writeUInt16(central, 6, 20);
  writeUInt16(central, 8, 0);
  writeUInt16(central, 10, 0);
  writeUInt16(central, 12, modified.time);
  writeUInt16(central, 14, modified.day);
  writeUInt32(central, 16, checksum);
  writeUInt32(central, 20, data.length);
  writeUInt32(central, 24, data.length);
  writeUInt16(central, 28, name.length);
  writeUInt16(central, 30, 0);
  writeUInt16(central, 32, 0);
  writeUInt16(central, 34, 0);
  writeUInt16(central, 36, 0);
  writeUInt32(central, 38, 0);
  writeUInt32(central, 42, offset);
  central.set(name, 46);

  return { local, central };
}

function buildEndRecord(entryCount: number, centralLength: number, centralOffset: number) {
  const end = new Uint8Array(22);
  writeUInt32(end, 0, 0x06054b50);
  writeUInt16(end, 4, 0);
  writeUInt16(end, 6, 0);
  writeUInt16(end, 8, entryCount);
  writeUInt16(end, 10, entryCount);
  writeUInt32(end, 12, centralLength);
  writeUInt32(end, 16, centralOffset);
  writeUInt16(end, 20, 0);
  return end;
}

async function* zipArchiveChunks(entries: ZipEntry[]): AsyncGenerator<Uint8Array> {
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const data = toBytes(typeof entry.data === "function" ? await entry.data() : entry.data);
    const { local, central } = buildEntryParts(entry, data, offset);
    centralParts.push(central);
    offset += local.length;
    yield local;
  }

  const central = concat(centralParts);
  yield central;
  yield buildEndRecord(entries.length, central.length, offset);
}

export function zipArchiveStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const iterator = zipArchiveChunks(entries)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel() {
      await iterator.return?.(undefined);
    },
  });
}

export async function collectZipArchive(entries: ZipEntry[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of zipArchiveChunks(entries)) {
    chunks.push(chunk);
  }
  return concat(chunks);
}
