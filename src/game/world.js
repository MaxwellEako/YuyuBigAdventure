import * as THREE from "three";
import { VoxelKit, noise } from "./voxel.js";
import { DIRECTIONS, samePosition } from "./levels.js";

const directionNames = Object.keys(DIRECTIONS);

/** 负责小岛场景、镜头和动画；所有通关判断均交给 PuzzleEngine。 */
export class IslandWorld {
  constructor(container, onTileClick) {
    this.container = container;
    this.kit = new VoxelKit();
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-9, 9, 7, -7, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({
      // 用硬件抗锯齿平滑边缘，方块感来自模型本身，而不是故意制造锯齿。
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    // 保留高清屏的真实细节；最高 2 倍像素比，避免移动设备承担过高填充成本。
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "可交互的 3D 方块小岛，方向键按屏幕方向移动，也可以点击相邻地块",
    );
    this.renderer.domElement.setAttribute("role", "img");
    container.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight("#fffae4", "#c6c2a6", 2.7));
    this.sun = new THREE.DirectionalLight("#fff0cd", 3.5);
    this.sun.position.set(-8, 14, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -10,
      right: 10,
      top: 10,
      bottom: -10,
      near: 0.5,
      far: 40,
    });
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.bias = -0.0002;
    this.scene.add(this.sun);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: "#64705b", opacity: 0.12 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -2.1;
    shadow.receiveShadow = true;
    this.scene.add(shadow);
    this.shadow = shadow;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clickHandler = (event) => {
      const rectangle = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set(
        ((event.clientX - rectangle.left) / rectangle.width) * 2 - 1,
        (-(event.clientY - rectangle.top) / rectangle.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster
        .intersectObjects(this.island?.children ?? [], true)
        .find((item) => {
          let object = item.object;
          while (object && !object.userData.tile) object = object.parent;
          return object?.userData.tile || item.object.userData.tiles;
        });
      if (hit?.object.userData.tiles) {
        onTileClick(hit.object.userData.tiles[hit.instanceId]);
      } else if (hit) {
        let object = hit.object;
        while (!object.userData.tile) object = object.parent;
        onTileClick(object.userData.tile);
      }
    };
    this.renderer.domElement.addEventListener("pointerdown", this.clickHandler);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.lastTime = performance.now();
    this.frame = this.frame.bind(this);
    this.frameId = requestAnimationFrame(this.frame);
  }

  /** 等距镜头保持整座岛可见，窄屏时按画布宽度缩放而不裁掉边缘。 */
  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    const aspect = width / height;
    const span = Math.max(12.4, 16.7 / aspect);
    this.camera.left = (-span * aspect) / 2;
    this.camera.right = (span * aspect) / 2;
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.updateProjectionMatrix();
  }

  position(object, coordinates, y = 0) {
    object.position.set(
      coordinates[0] - this.center[0],
      y,
      coordinates[1] - this.center[1],
    );
    return object;
  }

  cell(position) {
    const group = new THREE.Group();
    this.position(group, position);
    group.userData.tile = position;
    this.island.add(group);
    return group;
  }

  /** 切关时释放独立贴图/材质；通用方块资源由 VoxelKit 跨关复用。 */
  clear() {
    if (!this.island) return;
    this.scene.remove(this.island);
    this.uniqueResources.forEach((resource) => resource.dispose());
  }

  load(engine) {
    this.clear();
    this.engine = engine;
    this.uniqueResources = [];
    this.island = new THREE.Group();
    this.scene.add(this.island);
    const level = engine.level;
    this.center = [
      Math.max(...level.map.map((row) => row.length)) / 2 - 0.5,
      level.map.length / 2 - 0.5,
    ];
    this.gems = [];
    this.bridges = [];
    this.plates = [];
    this.mirrors = [];
    this.runes = [];
    this.particles = [];
    this.path = [];
    this.angle = 0;
    this.setCamera();
    const ice = level.type === "ice";
    const topColors = ice
      ? ["#e0e5d3", "#dae2d0", "#e9e8d6"]
      : ["#b3bf8f", "#b9c392", "#c1c89a", "#aebd8a"];
    const featured = [
      ...level.crystals,
      level.start,
      level.exit,
      ...(level.crates ?? []),
      ...(level.plates ?? []),
      ...(level.mirrors ?? []).map((mirror) => mirror.pos),
      ...(level.runes ?? []).map((rune) => rune.pos),
    ];
    level.map.forEach((row, z) =>
      [...row].forEach((tile, x) => {
        if (tile === " " || tile === "~") return;
        const group = this.cell([x, z]);
        const seed = noise(x, z);
        if (["=", "a", "b"].includes(tile)) {
          group.userData.dynamic = true;
          const bridge = new THREE.Group();
          group.add(bridge);
          for (let plank = 0; plank < 5; plank++) {
            this.kit.box(
              bridge,
              tile === "b" ? "#a59bbd" : "#d5b080",
              [0.17, 0.14, 0.91],
              [-0.4 + plank * 0.2, -0.03, 0],
            );
          }
          this.kit.box(bridge, "#8d8062", [1.04, 0.16, 0.08], [0, -0.1, -0.34]);
          this.kit.box(bridge, "#8d8062", [1.04, 0.16, 0.08], [0, -0.1, 0.34]);
          const ghost = this.kit.box(
            group,
            "#aeb69d",
            [0.85, 0.035, 0.85],
            [0, -0.46, 0],
            { shadow: false },
          );
          this.bridges.push({ tile, bridge, ghost });
          return;
        }
        this.kit.box(
          group,
          topColors[Math.floor(seed * topColors.length)],
          [0.99, 0.22, 0.99],
          [0, -0.08, 0],
        );
        this.kit.box(
          group,
          seed > 0.4 ? "#b3a584" : "#bbad8b",
          [0.98, 0.48, 0.98],
          [0, -0.43, 0],
        );
        const depth = 0.34 + seed * 0.53;
        this.kit.box(
          group,
          seed > 0.55 ? "#9e967b" : "#a79c7e",
          [0.97, depth, 0.97],
          [0, -0.67 - depth / 2, 0],
        );
        if (seed > 0.7)
          this.kit.box(
            group,
            "#888a71",
            [0.7, 0.3, 0.7],
            [0, -0.82 - depth, 0],
          );
        if (tile === "#") {
          if (ice || (x + z) % 4 === 0) this.kit.rock(group, seed, ice);
          else this.kit.tree(group, seed, false, z > 5 || (x + z) % 3 === 0);
        } else if (tile === "i") {
          this.kit.box(
            group,
            seed > 0.5 ? "#a5cccf" : "#b7d6d4",
            [0.98, 0.055, 0.98],
            [0, 0.055, 0],
          );
          this.kit.box(
            group,
            "#d9ece1",
            [0.33, 0.006, 0.035],
            [0.12, 0.087, 0.18],
            { shadow: false },
          );
        } else {
          // 岛内路径是浅色小方砖；角落点缀草簇，保持机关地块清晰。
          const path =
            (level.type === "pressure" &&
              (z === 4 || (x === 4 && z > 1 && z < 7))) ||
            (level.type !== "pressure" && (x + z) % 3 !== 0);
          if (path)
            this.kit.box(
              group,
              ice ? "#eeebd8" : "#d4d3ae",
              [0.77 + seed * 0.1, 0.025, 0.78],
              [0, 0.043, 0],
            );
          if (
            !featured.some((feature) => samePosition(feature, [x, z])) &&
            seed > 0.53
          ) {
            this.kit.box(
              group,
              "#8fa175",
              [0.05, 0.2, 0.05],
              [0.34, 0.12, -0.32],
            );
            this.kit.box(
              group,
              "#96a574",
              [0.05, 0.13, 0.07],
              [0.26, 0.085, -0.31],
            );
            if (seed > 0.78)
              this.kit.box(
                group,
                "#f1d19b",
                [0.09, 0.08, 0.09],
                [0.34, 0.24, -0.32],
              );
          }
        }
      }),
    );
    this.batchTerrain();
    this.buildFixtures();
    this.player = this.kit.traveler();
    this.island.add(this.position(this.player, engine.state.player, 0.08));
    const marker = this.kit.box(
      this.player,
      "#e9d68d",
      [0.16, 0.16, 0.16],
      [0, 1.66, 0],
      { glow: true, shadow: false },
    );
    marker.rotation.z = Math.PI / 4;
    this.marker = marker;
    this.crates = engine.state.crates.map((position) => {
      const crate = this.kit.crate();
      this.island.add(this.position(crate, position, 0.08));
      return crate;
    });
    this.portal = this.kit.portal();
    this.uniqueResources.push(this.portal.userData.veil.material);
    this.island.add(this.position(this.portal, level.exit, 0.07));
    this.portal.userData.tile = level.exit;
    this.buildParticles();
    this.sync(true);
    this.resize();
  }

  /**
   * 把同材质的静态方块合并为实例绘制，数百个地形方块只需几十次 draw call。
   * 每个实例仍保存原地块坐标，所以点击寻址不受优化影响；桥与机关保持独立。
   */
  batchTerrain() {
    const batches = new Map();
    this.island.updateMatrixWorld(true);
    for (const cell of [...this.island.children]) {
      if (cell.userData.dynamic) continue;
      cell.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const key = `${mesh.material.uuid}:${mesh.castShadow}`;
        if (!batches.has(key))
          batches.set(key, {
            material: mesh.material,
            shadow: mesh.castShadow,
            instances: [],
          });
        batches.get(key).instances.push({
          matrix: mesh.matrixWorld.clone(),
          tile: cell.userData.tile,
        });
      });
      this.island.remove(cell);
    }
    for (const { material, shadow, instances } of batches.values()) {
      const mesh = new THREE.InstancedMesh(
        this.kit.geometry,
        material,
        instances.length,
      );
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.userData.tiles = instances.map((instance) => instance.tile);
      instances.forEach((instance, index) =>
        mesh.setMatrixAt(index, instance.matrix),
      );
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.island.add(mesh);
      this.uniqueResources.push(mesh);
    }
  }

  buildFixtures() {
    const level = this.engine.level;
    (level.plates ?? []).forEach((position) => {
      const group = this.cell(position);
      this.kit.box(group, "#969d79", [0.83, 0.1, 0.83], [0, 0.08, 0]);
      const plate = this.kit.box(
        group,
        "#ecc46e",
        [0.59, 0.04, 0.59],
        [0, 0.15, 0],
        { glow: true },
      );
      this.kit.box(group, "#a59261", [0.18, 0.045, 0.18], [0, 0.175, 0]);
      this.plates.push(plate);
    });
    level.crystals.forEach((position, index) => {
      const group = this.cell(position);
      const gem = new THREE.Group();
      group.add(gem);
      const material = this.kit.material(
        position[2] === 1 ? "#ba9dd5" : "#edc45f",
        true,
      );
      const geometry = new THREE.OctahedronGeometry(0.23, 0);
      this.uniqueResources.push(geometry);
      const crystal = new THREE.Mesh(geometry, material);
      crystal.castShadow = true;
      crystal.scale.y = 1.35;
      gem.add(crystal);
      this.kit.box(group, "#c6c89c", [0.38, 0.05, 0.38], [0, 0.09, 0]);
      this.gems.push({ mesh: gem, index, phase: position[2] });
    });
    (level.mirrors ?? []).forEach((mirror) => {
      const group = this.cell(mirror.pos);
      this.kit.box(group, "#a3a68b", [0.62, 0.2, 0.62], [0, 0.13, 0]);
      this.kit.box(group, "#a0916f", [0.13, 0.5, 0.13], [0, 0.47, 0]);
      const surface = new THREE.Group();
      surface.position.y = 0.89;
      group.add(surface);
      this.kit.box(surface, "#d5b875", [0.89, 0.83, 0.15], [0, 0, 0]);
      this.kit.box(surface, "#d4f2e9", [0.69, 0.63, 0.18], [0, 0, 0], {
        glow: true,
      });
      this.mirrors.push(surface);
    });
    if (level.emitter) {
      const source = this.cell(level.emitter);
      this.kit.box(source, "#ac9e7d", [0.55, 0.55, 0.55], [0, 0.32, 0]);
      this.kit.box(source, "#f6d277", [0.65, 0.23, 0.23], [0.07, 0.76, 0], {
        glow: true,
      });
      const receiver = this.cell(level.receiver);
      this.kit.box(receiver, "#ac9e7d", [0.48, 0.62, 0.48], [0, 0.34, 0]);
      this.receiver = this.kit.box(
        receiver,
        "#e0c77c",
        [0.36, 0.36, 0.36],
        [0, 0.88, 0],
        { glow: true },
      );
    }
    (level.runes ?? []).forEach((rune, index) => {
      const group = this.cell(rune.pos);
      this.kit.box(group, "#a3ad96", [0.72, 0.23, 0.72], [0, 0.14, 0]);
      const stone = this.kit.box(
        group,
        "#b6bda4",
        [0.53, 0.75, 0.45],
        [0, 0.6, 0],
      );
      const label = this.label(`${rune.symbol} ${rune.label}`);
      label.position.set(0, 1.24, 0);
      group.add(label);
      this.runes.push({ stone, index });
    });
  }

  /** 少量文字贴图用于石碑标记，避免用户必须凭颜色辨认机关。 */
  label(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    context.fillStyle = "#faf4de";
    context.fillRect(0, 0, 256, 96);
    context.font = "bold 42px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#58644b";
    context.fillText(text, 128, 48);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: true,
    });
    this.uniqueResources.push(texture, material);
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.04, 0.39, 1);
    return sprite;
  }

  buildParticles() {
    for (let index = 0; index < 20; index++) {
      const particle = this.kit.box(
        this.island,
        index % 2 ? "#e5c386" : "#c2caa7",
        [0.045, 0.045, 0.045],
        [0, 0, 0],
        { shadow: false },
      );
      particle.userData.origin = [
        (noise(index, 1) - 0.5) * 14,
        0.5 + noise(index, 2) * 3,
        (noise(index, 3) - 0.5) * 12,
      ];
      this.particles.push(particle);
    }
  }

  sync(instant = false, path = []) {
    const { state, level } = this.engine;
    this.path =
      instant || this.reducedMotion
        ? []
        : path.map(
            (point) =>
              new THREE.Vector3(
                point[0] - this.center[0],
                0.08,
                point[1] - this.center[1],
              ),
          );
    if (instant || this.reducedMotion)
      this.position(this.player, state.player, 0.08);
    this.crates.forEach((crate, index) =>
      this.position(crate, state.crates[index], 0.08),
    );
    this.gems.forEach(({ mesh, index, phase }) => {
      mesh.visible =
        !state.collected.includes(index) &&
        (phase === undefined || phase === state.phase);
    });
    this.bridges.forEach(({ tile, bridge, ghost }) => {
      bridge.visible =
        tile === "="
          ? this.engine.pressed
          : tile === "a"
            ? state.phase === 0
            : state.phase === 1;
      ghost.visible = !bridge.visible;
    });
    this.plates.forEach((plate) => {
      plate.material = this.kit.material(
        this.engine.pressed ? "#9bce93" : "#ecc46e",
        true,
      );
    });
    this.mirrors.forEach((mirror, index) => {
      mirror.rotation.y = state.mirrors[index] ? -Math.PI / 4 : Math.PI / 4;
    });
    this.runes.forEach(({ stone, index }) => {
      stone.material = this.kit.material(
        state.sequence.includes(index) ? "#d1c887" : "#b6bda4",
      );
    });
    const portalReady =
      this.engine.solved && state.collected.length === level.crystals.length;
    this.portal.userData.veil.material.opacity = portalReady ? 0.68 : 0.12;
    this.portal.userData.rune.material = this.kit.material(
      portalReady ? "#aad895" : "#d1ab67",
      true,
    );
    this.sun.color.set(state.phase ? "#d8d7ff" : "#fff0cd");
    this.sun.intensity = state.phase ? 2.1 : 3.5;
    if (level.type === "laser") this.drawBeam();
  }

  drawBeam() {
    if (this.beamGroup) this.island.remove(this.beamGroup);
    this.beamGroup = new THREE.Group();
    this.island.add(this.beamGroup);
    const beam = this.engine.beam;
    this.receiver.material = this.kit.material(
      beam.lit ? "#b4e0a4" : "#e0c77c",
      true,
    );
    beam.points.slice(1).forEach((position, index) => {
      const previous = beam.points[index];
      const x = (position[0] + previous[0]) / 2 - this.center[0];
      const z = (position[1] + previous[1]) / 2 - this.center[1];
      this.kit.box(
        this.beamGroup,
        "#ffe2a1",
        [
          position[0] === previous[0] ? 0.045 : 1,
          0.045,
          position[1] === previous[1] ? 0.045 : 1,
        ],
        [x, 0.77, z],
        { glow: true, shadow: false },
      );
    });
  }

  setCamera() {
    // 在正向俯视的基础上侧转 15°，露出方块侧面，避免画面过于平直。
    // 这点偏角不会改变四个移动方向的主方向；按键仍跟随每次 90° 的镜头旋转。
    const rotation = this.angle + Math.PI / 12;
    this.camera.position.set(
      Math.sin(rotation) * 17,
      15,
      Math.cos(rotation) * 17,
    );
    this.camera.lookAt(0, -0.1, 0);
    this.camera.updateMatrixWorld(true);
  }

  rotate() {
    this.angle = (this.angle + Math.PI / 2) % (Math.PI * 2);
    this.setCamera();
  }

  /**
   * 按镜头的四分之一圈数，把屏幕方向逆旋转到棋盘方向。
   * 例如镜头从南面转到东面后，屏幕“上”对应棋盘“左”；规则仍只处理原坐标。
   */
  toWorldDirection(screenDirection) {
    const screenIndex = directionNames.indexOf(screenDirection);
    const turns = Math.round(this.angle / (Math.PI / 2));
    return directionNames[
      (screenIndex - turns + directionNames.length) % directionNames.length
    ];
  }

  get busy() {
    return this.path.length > 0;
  }

  frame(now) {
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const time = this.reducedMotion ? 0 : now / 1000;
    if (this.player) {
      if (this.path.length) {
        const target = this.path[0];
        const difference = target.clone().sub(this.player.position);
        difference.y = 0;
        this.player.rotation.y = Math.atan2(difference.x, difference.z);
        const travel = delta * (this.engine.level.type === "ice" ? 10 : 6.8);
        if (difference.length() <= travel) {
          this.player.position.copy(target);
          this.path.shift();
        } else
          this.player.position.add(
            difference.normalize().multiplyScalar(travel),
          );
      }
      this.player.position.y =
        0.08 +
        (this.path.length && !this.reducedMotion
          ? Math.abs(Math.sin(time * 19)) * 0.085
          : 0);
      this.marker.position.y = 1.65 + Math.sin(time * 2.7) * 0.08;
      this.gems.forEach(({ mesh, index }) => {
        mesh.position.y = 0.69 + Math.sin(time * 2.1 + index) * 0.08;
        mesh.rotation.y = time * 0.7;
      });
      this.particles.forEach((particle, index) => {
        const [x, y, z] = particle.userData.origin;
        particle.position.set(
          x + Math.sin(time * 0.15 + index) * 0.55,
          y + Math.sin(time * 0.45 + index) * 0.2,
          z,
        );
      });
    }
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.frame);
  }

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener(
      "pointerdown",
      this.clickHandler,
    );
    this.clear();
    this.kit.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
