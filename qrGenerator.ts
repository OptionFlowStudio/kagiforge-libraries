import QRCode from 'qrcode';

export type QrModules = { size: number; data: number[] };

export const createQrModules = (input: string, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' = 'M'): QrModules => {
  const qr = QRCode.create(input, { errorCorrectionLevel });
  const { size, data } = qr.modules;
  return { size, data: Array.from(data) };
};

export const buildQrSvgString = (modules: QrModules, color: string) => {
  const size = modules.size;
  const padding = 2;
  const viewSize = size + padding * 2;
  let rects = '';
  for (let i = 0; i < modules.data.length; i++) {
    if (!modules.data[i]) continue;
    const row = Math.floor(i / size);
    const col = i % size;
    rects += `<rect x="${col + padding}" y="${row + padding}" width="1" height="1" rx="0.2" ry="0.2" fill="${color}" />`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges">${rects}</svg>`;
};
