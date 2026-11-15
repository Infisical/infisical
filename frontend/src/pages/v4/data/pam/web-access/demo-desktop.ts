type TPixel = [red: number, green: number, blue: number];

export type TDemoRect = [x: number, y: number, width: number, height: number, pixel: TPixel];

export type TDemoFrame = { atMs: number; rects: TDemoRect[] };

export type TDemoPointer = {
  atMs: number;
  x: number;
  y: number;
  click?: boolean;
};

const TEXT: TPixel = [87, 96, 106];
const LINE: TPixel = [208, 215, 222];
const SHELL_TEXT: TPixel = [230, 237, 243];

const shellLines = [520, 344, 612, 288, 700, 456, 380, 548];

export const DEMO_DESKTOP_FRAMES: TDemoFrame[] = [
  {
    atMs: 0,
    rects: [
      [0, 0, 1920, 1032, [11, 58, 91]],
      [0, 1032, 1920, 48, [22, 24, 29]],
      [16, 1040, 32, 32, [47, 129, 247]],
      [64, 1040, 32, 32, [59, 64, 73]],
      [104, 1040, 32, 32, [59, 64, 73]],
      [1776, 1048, 120, 16, [139, 148, 158]],
      [32, 32, 48, 48, LINE],
      [32, 120, 48, 48, LINE]
    ]
  },
  {
    atMs: 2400,
    rects: [
      [360, 140, 1200, 720, [255, 255, 255]],
      [360, 140, 1200, 36, [243, 244, 246]],
      [376, 152, 180, 12, TEXT],
      [1500, 148, 48, 20, LINE],
      [360, 176, 240, 684, [246, 248, 250]],
      [384, 200, 160, 12, TEXT],
      [384, 232, 128, 12, TEXT],
      [384, 264, 144, 12, TEXT],
      [624, 200, 912, 64, [9, 105, 218]],
      [648, 224, 320, 16, [255, 255, 255]],
      [144, 1040, 32, 32, [59, 64, 73]]
    ]
  },
  ...[0, 1, 2].map((tile): TDemoFrame => ({
    atMs: 5200 + tile * 1800,
    rects: [
      [624 + tile * 304, 288, 288, 160, [238, 242, 247]],
      [640 + tile * 304, 304, 160, 12, TEXT],
      [
        640 + tile * 304,
        400,
        96,
        28,
        [
          [26, 127, 55],
          [154, 103, 0],
          [26, 127, 55]
        ][tile] as TPixel
      ]
    ]
  })),
  {
    atMs: 12800,
    rects: [
      [624, 472, 912, 364, [255, 255, 255]],
      ...[0, 1, 2, 3, 4, 5].map((row): TDemoRect => [640, 488 + row * 56, 880, 1, LINE]),
      ...[0, 1, 2, 3, 4, 5].map((row): TDemoRect => [
        640,
        504 + row * 56,
        240 + (row % 3) * 80,
        12,
        TEXT
      ])
    ]
  },
  {
    atMs: 20400,
    rects: [
      [520, 420, 960, 520, [1, 36, 86]],
      [520, 420, 960, 32, [230, 237, 243]],
      [536, 430, 220, 12, TEXT],
      [184, 1040, 32, 32, [47, 129, 247]]
    ]
  },
  ...shellLines.map((width, line): TDemoFrame => ({
    atMs: 23600 + line * 3200,
    rects: [[536, 468 + line * 28, width, 14, SHELL_TEXT]]
  })),
  {
    atMs: 52000,
    rects: [[536, 468 + shellLines.length * 28, 160, 14, [63, 185, 80]]]
  }
];

export const DEMO_DESKTOP_POINTER: TDemoPointer[] = [
  { atMs: 1200, x: 940, y: 600 },
  { atMs: 1800, x: 56, y: 56, click: true },
  { atMs: 4400, x: 460, y: 238 },
  { atMs: 4900, x: 448, y: 238, click: true },
  { atMs: 7600, x: 760, y: 360, click: true },
  { atMs: 11000, x: 1080, y: 410, click: true },
  { atMs: 15600, x: 900, y: 616, click: true },
  { atMs: 19200, x: 200, y: 1056, click: true },
  { atMs: 22400, x: 900, y: 600, click: true },
  { atMs: 50400, x: 1300, y: 760 },
  { atMs: 56800, x: 1524, y: 158, click: true }
];

export const paintDemoDesktop = (context: CanvasRenderingContext2D) => {
  const { width: canvasWidth, height: canvasHeight } = context.canvas;
  const image = context.createImageData(canvasWidth, canvasHeight);
  DEMO_DESKTOP_FRAMES.forEach(({ rects }) =>
    rects.forEach(([x, y, width, height, pixel]) => {
      for (let row = y; row < y + height; row += 1)
        for (let column = x; column < x + width; column += 1) {
          const offset = (row * canvasWidth + column) * 4;
          image.data.set([...pixel, 255], offset);
        }
    })
  );
  context.putImageData(image, 0, 0);
};

const u16 = (value: number) => [value % 256, Math.floor(value / 256) % 256];

const rgb565 = ([red, green, blue]: TPixel) =>
  Math.floor(red / 8) * 2048 + Math.floor(green / 4) * 32 + Math.floor(blue / 8);

// An interleaved RLE bitmap that is one colour run (MEGA_MEGA_COLOR_RUN), with no compression header
const solidBitmap = ([x, y, width, height, pixel]: TDemoRect) => {
  const runs: number[] = [];
  for (let left = width * height; left > 0; left -= 0xffff)
    runs.push(0xf3, ...u16(Math.min(left, 0xffff)), ...u16(rgb565(pixel)));
  return [
    ...u16(x),
    ...u16(y),
    ...u16(x + width - 1),
    ...u16(y + height - 1),
    ...u16(width),
    ...u16(height),
    ...u16(16),
    ...u16(0x0401),
    ...u16(runs.length),
    ...runs
  ];
};

// A FastPath bitmap update, the PDU the gateway records for each server frame
export const encodeDemoFrame = (rects: TDemoRect[]) => {
  const body = [...u16(1), ...u16(rects.length), ...rects.flatMap(solidBitmap)];
  const update = [0x01, ...u16(body.length), ...body];
  const length = update.length + 3;
  return new Uint8Array([0x00, 0x80 + Math.floor(length / 256), length % 256, ...update]);
};
