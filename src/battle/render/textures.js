import * as THREE from "three";
import { drawPixelHeart } from "../pixelHeart.js";

/** 所有贴图都用 Canvas 程序化生成，不依赖外部资源。 */
function canvasTexture(width, height, draw, { repeat = null } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
}

/** 棋盘边缘的坐标字母与数字（等宽字体，灰色）。 */
export function labelTexture(text, { color = "#737373", size = 128 } = {}) {
  return canvasTexture(size, size, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.font = `500 ${Math.round(h * 0.46)}px "JetBrains Mono", "SF Mono", Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
}

/**
 * 桌面纸面上的极细网格：一张贴图覆盖 4×4 个单位，单位线极淡、每 4 格一条稍重的线。
 * repeat 取整数时网格线正好落在整数坐标上，与棋格边缘对齐。
 */
export function gridTexture(repeat) {
  const texture = canvasTexture(
    512,
    512,
    (ctx, w) => {
      ctx.fillStyle = "#ebeae6";
      ctx.fillRect(0, 0, w, w);
      const step = w / 4;
      ctx.fillStyle = "rgba(10, 10, 10, 0.07)";
      for (let i = 1; i < 4; i += 1) {
        ctx.fillRect(i * step, 0, 1, w);
        ctx.fillRect(0, i * step, w, 1);
      }
      ctx.fillStyle = "rgba(10, 10, 10, 0.16)";
      ctx.fillRect(0, 0, 2, w);
      ctx.fillRect(0, 0, w, 2);
      // 网格交点上的小十字，像印刷用的套准标记。
      ctx.fillStyle = "rgba(10, 10, 10, 0.28)";
      ctx.fillRect(0, 0, 12, 2);
      ctx.fillRect(0, 0, 2, 12);
    },
    { repeat: [repeat, repeat] },
  );
  return texture;
}

/** 铭牌画布的放大倍数。 */
const LABEL_SCALE = 2;

/** 头顶的直角铭牌：墨黑底 + 细字重数字；发现主角时右侧亮起 IKB 方块，晕眩时为灰色 Z。 */
export class LabelSprite {
  constructor() {
    // 画布按 2 倍分辨率绘制（逻辑尺寸仍是 320×96），放大显示时数字依然清晰。
    this.canvas = document.createElement("canvas");
    this.canvas.width = 320 * LABEL_SCALE;
    this.canvas.height = 96 * LABEL_SCALE;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true, toneMapped: false }),
    );
    this.setScale(1);
    this.sprite.renderOrder = 10;
  }

  /** 按倍数缩放铭牌（竖屏手机上棋盘显得小，铭牌放大才看得清数字）。 */
  setScale(k) {
    this.sprite.scale.set(1.12 * k, 0.34 * k, 1);
  }

  draw({ hearts, total, armor = 0, alert = false, stun = false }) {
    const ctx = this.canvas.getContext("2d");
    ctx.setTransform(LABEL_SCALE, 0, 0, LABEL_SCALE, 0, 0);
    const w = this.canvas.width / LABEL_SCALE;
    const h = this.canvas.height / LABEL_SCALE;
    ctx.clearRect(0, 0, w, h);
    const sans = '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';
    const text = String(hearts);
    const sub = `/${total}`;
    ctx.font = `300 44px ${sans}`;
    const tw = ctx.measureText(text).width;
    ctx.font = `500 22px ${sans}`;
    const sw = ctx.measureText(sub).width;
    const armorW = armor ? 46 : 0;
    const flagW = alert || stun ? 60 : 0;
    const boxW = 44 + tw + sw + 18 + armorW;
    const x = (w - boxW - flagW) / 2;
    const y = 16;
    const boxH = 60;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(x, y, boxW, boxH);
    drawPixelHeart(ctx, x + 12, y + 20, 3, "#e0262f");
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fafaf8";
    ctx.font = `300 44px ${sans}`;
    ctx.fillText(text, x + 40, y + 46);
    ctx.fillStyle = "#a3a3a3";
    ctx.font = `500 22px ${sans}`;
    ctx.fillText(sub, x + 42 + tw, y + 46);
    if (armor) {
      const ax = x + 48 + tw + sw;
      ctx.strokeStyle = "#fafaf8";
      ctx.lineWidth = 3;
      ctx.strokeRect(ax + 4, y + 18, 24, 24);
      ctx.fillStyle = "#fafaf8";
      ctx.font = `600 16px ${sans}`;
      ctx.textAlign = "center";
      ctx.fillText(String(armor), ax + 16, y + 36);
      ctx.textAlign = "left";
    }
    if (alert || stun) {
      const fx = x + boxW;
      ctx.fillStyle = alert ? "#002fa7" : "#737373";
      ctx.fillRect(fx, y, boxH, boxH);
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 36px ${sans}`;
      ctx.textAlign = "center";
      ctx.fillText(alert ? "!" : "Z", fx + boxH / 2, y + 44);
      ctx.textAlign = "left";
    }
    this.texture.needsUpdate = true;
  }
}

