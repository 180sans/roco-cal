export type NumericOcrMode = "power" | "enemy_health" | "self_health";

export function prepareNumericCanvas(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sourceWidth * 2);
  canvas.height = Math.max(1, sourceHeight * 2);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("数字识别图片无法处理");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray = Math.round(0.299 * pixels.data[index] + 0.587 * pixels.data[index + 1] + 0.114 * pixels.data[index + 2]);
    pixels.data[index] = gray;
    pixels.data[index + 1] = gray;
    pixels.data[index + 2] = gray;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export async function prepareNumericImage(imageDataUrl: string) {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("数字识别图片无法读取"));
    image.src = imageDataUrl;
  });
  return prepareNumericCanvas(image, image.naturalWidth, image.naturalHeight).toDataURL("image/png");
}
