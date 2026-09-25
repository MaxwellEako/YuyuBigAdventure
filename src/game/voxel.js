import * as THREE from "three";

/** 复用方块几何体和同色材质，像素模型不需要外部贴图或下载资源。 */
export class VoxelKit {
  constructor() {
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.materials = new Map();
  }

  material(color, glow = false) {
    const key = `${color}-${glow}`;
    if (!this.materials.has(key)) {
      this.materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 1,
          metalness: 0,
          flatShading: true,
          ...(glow ? { emissive: color, emissiveIntensity: 0.45 } : {}),
        }),
      );
    }
    return this.materials.get(key);
  }

  box(parent, color, size, position, options = {}) {
    const mesh = new THREE.Mesh(
      this.geometry,
      this.material(color, options.glow),
    );
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = options.shadow !== false;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** 身体由小方块组成，脸朝 +z；渲染层会按行走方向转动整个角色。 */
  traveler() {
    const group = new THREE.Group();
    this.box(group, "#524e3e", [0.16, 0.16, 0.22], [-0.14, 0.12, 0.03]);
    this.box(group, "#524e3e", [0.16, 0.16, 0.22], [0.14, 0.12, 0.03]);
    this.box(group, "#d9743e", [0.47, 0.43, 0.35], [0, 0.4, 0]);
    this.box(group, "#efac64", [0.13, 0.33, 0.22], [-0.3, 0.43, 0.01]);
    this.box(group, "#efac64", [0.13, 0.33, 0.22], [0.3, 0.43, 0.01]);
    this.box(group, "#b8ac80", [0.32, 0.32, 0.18], [0, 0.4, -0.24]);
    this.box(group, "#ec9557", [0.65, 0.57, 0.52], [0, 0.87, 0]);
    this.box(group, "#eea969", [0.17, 0.16, 0.35], [-0.23, 1.19, -0.04]);
    this.box(group, "#eea969", [0.17, 0.16, 0.35], [0.23, 1.19, -0.04]);
    this.box(group, "#fff0ca", [0.48, 0.34, 0.06], [0, 0.83, 0.28]);
    this.box(group, "#3c4637", [0.075, 0.105, 0.03], [-0.115, 0.875, 0.325]);
    this.box(group, "#3c4637", [0.075, 0.105, 0.03], [0.115, 0.875, 0.325]);
    this.box(group, "#ce774a", [0.06, 0.035, 0.03], [0, 0.76, 0.325]);
    this.box(group, "#f5d174", [0.54, 0.1, 0.42], [0, 0.58, 0.015]);
    this.box(group, "#f5d174", [0.15, 0.3, 0.08], [0.14, 0.46, 0.23]);
    return group;
  }

  tree(parent, seed, winter = false, low = false) {
    const height = low ? 0.85 : 1.6 + seed * 0.8;
    const foliage = winter
      ? ["#bdd0cd", "#dbe1ce", "#a2bfba"]
      : ["#889766", "#daa576", "#dfb16e", "#70845b"];
    const color = foliage[Math.floor(seed * foliage.length) % foliage.length];
    this.box(parent, "#877154", [0.22, height, 0.23], [0, height / 2, 0]);
    this.box(parent, color, [1.12, low ? 0.5 : 0.92, 1.06], [0, height, 0]);
    this.box(
      parent,
      color,
      [0.83, 0.34, 0.82],
      [-0.05, height + (low ? 0.32 : 0.61), -0.06],
    );
    this.box(parent, color, [0.39, 0.42, 0.62], [0.62, height - 0.12, 0.12]);
    this.box(
      parent,
      winter ? "#edf0de" : "#d2b582",
      [0.2, 0.11, 0.3],
      [-0.31, height + (low ? 0.3 : 0.51), 0.35],
    );
  }

  rock(parent, seed, ice = false) {
    this.box(
      parent,
      ice ? "#c5d4d0" : "#a7a58b",
      [0.62, 0.4 + seed * 0.3, 0.58],
      [0, 0.25, 0],
    );
    this.box(
      parent,
      ice ? "#e2e8d9" : "#bdbea2",
      [0.4, 0.15, 0.42],
      [-0.04, 0.51 + seed * 0.13, -0.03],
    );
    this.box(
      parent,
      ice ? "#a9c2c2" : "#95987c",
      [0.27, 0.25, 0.32],
      [0.33, 0.14, 0.15],
    );
  }

  crate() {
    const group = new THREE.Group();
    this.box(group, "#bd8756", [0.67, 0.65, 0.67], [0, 0.36, 0]);
    for (const side of [-1, 1]) {
      this.box(
        group,
        "#e4b47a",
        [0.76, 0.12, 0.76],
        [0, 0.36 + side * 0.25, 0],
      );
      this.box(group, "#d49b64", [0.12, 0.65, 0.76], [side * 0.25, 0.36, 0]);
    }
    const brace = this.box(
      group,
      "#eed0a0",
      [0.1, 0.66, 0.06],
      [0, 0.36, 0.395],
    );
    brace.rotation.z = -Math.PI / 4;
    this.box(group, "#877353", [0.09, 0.09, 0.04], [0, 0.37, 0.43]);
    return group;
  }

  portal() {
    const group = new THREE.Group();
    for (const side of [-1, 1]) {
      this.box(group, "#b0b49a", [0.31, 1.6, 0.38], [side * 0.56, 0.8, 0]);
      this.box(group, "#c8cbb0", [0.48, 0.2, 0.53], [side * 0.56, 0.15, 0]);
      this.box(group, "#d0d0b1", [0.43, 0.26, 0.5], [side * 0.56, 1.47, 0]);
      this.box(group, "#789069", [0.23, 0.09, 0.4], [side * 0.56, 1.65, -0.04]);
    }
    this.box(group, "#c7cab0", [1.44, 0.28, 0.45], [0, 1.8, 0]);
    this.box(group, "#dedec2", [1.08, 0.14, 0.43], [0, 2, 0]);
    const rune = this.box(group, "#d1ab67", [0.2, 0.2, 0.48], [0, 1.79, 0.02], {
      glow: true,
    });
    rune.rotation.z = Math.PI / 4;
    const veil = this.box(group, "#a6d1ae", [0.79, 1.36, 0.05], [0, 0.88, 0], {
      glow: true,
      shadow: false,
    });
    veil.material = veil.material.clone();
    veil.material.transparent = true;
    veil.material.opacity = 0.16;
    group.userData.veil = veil;
    group.userData.rune = rune;
    return group;
  }

  dispose() {
    this.geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
  }
}

/** 固定种子的装饰噪声：重置关卡时树木不会随机换位置，测试截图也可复现。 */
export function noise(x, z, salt = 0) {
  const value = Math.sin(x * 127.1 + z * 311.7 + salt * 43.4) * 43758.5453;
  return value - Math.floor(value);
}
