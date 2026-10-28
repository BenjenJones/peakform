declare module "@garmin/fitsdk" {
  export class Stream {
    static fromByteArray(bytes: Uint8Array | number[]): Stream;
  }
  export class Decoder {
    constructor(stream: Stream);
    isFIT(): boolean;
    read(options?: { convertDateTimesToDates?: boolean; [k: string]: unknown }): {
      messages: Record<string, Record<string, unknown>[] | undefined>;
      errors: unknown[];
    };
  }
}
