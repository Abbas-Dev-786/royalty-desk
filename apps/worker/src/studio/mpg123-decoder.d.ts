declare module "mpg123-decoder" {
  export interface MPEGDecodedAudio {
    readonly channelData: readonly Float32Array[];
    readonly samplesDecoded: number;
    readonly sampleRate: number;
    readonly errors: readonly unknown[];
  }

  export class MPEGDecoder {
    readonly ready: Promise<void>;
    decode(data: Uint8Array): MPEGDecodedAudio;
    free(): void;
  }
}
