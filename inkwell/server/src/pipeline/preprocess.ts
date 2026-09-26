// Stage 1: make a clean derivative image for the model (spec §10.2).
// We deliberately do NOT binarize or enhance: vision models read color originals better.
// sharp drops EXIF metadata on output by default, which strips GPS location.
import sharp from "sharp";

export interface Preprocessed {
  jpeg: Buffer;
  width: number;
  height: number;
}

export const MAX_LONG_SIDE = 3000;

/** Throws if sharp can't decode the image (the upload route turns that into a friendly 400). */
export async function preprocess(original: Buffer, opts: { grayscale?: boolean } = {}): Promise<Preprocessed> {
  let img = sharp(original, { failOn: "error" })
    .rotate() // apply EXIF orientation so phone photos are upright
    .resize({ width: MAX_LONG_SIDE, height: MAX_LONG_SIDE, fit: "inside", withoutEnlargement: true });
  if (opts.grayscale) img = img.grayscale().normalize(); // eval variant only
  const { data, info } = await img.jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  return { jpeg: data, width: info.width, height: info.height };
}

/** Cheap check that a buffer is a decodable raster image in a format we accept. */
export async function readImageFormat(buffer: Buffer): Promise<string | undefined> {
  try {
    return (await sharp(buffer).metadata()).format;
  } catch {
    return undefined;
  }
}
