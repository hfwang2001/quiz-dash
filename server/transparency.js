import sharp from 'sharp';

export async function whiteToTransparent(sourcePath, destinationPath, tolerance = 245) {
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelData = Buffer.from(data);

  for (let index = 0; index < pixelData.length; index += info.channels) {
    const red = pixelData[index];
    const green = pixelData[index + 1];
    const blue = pixelData[index + 2];

    if (red >= tolerance && green >= tolerance && blue >= tolerance) {
      pixelData[index + 3] = 0;
    }
  }

  await sharp(pixelData, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels
    }
  })
    .png()
    .toFile(destinationPath);

  return destinationPath;
}
