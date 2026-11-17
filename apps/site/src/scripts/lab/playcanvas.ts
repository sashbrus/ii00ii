// Bake-off candidate B: the PlayCanvas engine, on WebGPU where the browser has it,
// otherwise WebGL2. Add ?gpu=webgl2 to force WebGL2.
import {
  AppBase,
  AppOptions,
  Asset,
  CameraComponentSystem,
  Color,
  createGraphicsDevice,
  Entity,
  FILLMODE_FILL_WINDOW,
  GSplatComponentSystem,
  GSplatHandler,
  RESOLUTION_AUTO,
  TextureHandler,
} from 'playcanvas';
import { Bench } from './bench.ts';

const bench = new Bench('playcanvas');

async function start(): Promise<void> {
  const wanted = bench.params.get('gpu') === 'webgl2' ? ['webgl2'] : ['webgpu', 'webgl2'];
  const device = await createGraphicsDevice(bench.canvas, {
    deviceTypes: wanted,
    antialias: false,
    powerPreference: 'high-performance',
  });
  device.maxPixelRatio = bench.pixelRatio;
  bench.setBackend(device.isWebGPU ? 'webgpu' : 'webgl2');

  const options = new AppOptions();
  options.graphicsDevice = device;
  options.componentSystems = [CameraComponentSystem, GSplatComponentSystem];
  // SOG scenes are packed as WebP textures, so the texture loader is needed too.
  options.resourceHandlers = [GSplatHandler, TextureHandler];
  const app = new AppBase(bench.canvas);
  app.init(options);
  app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(RESOLUTION_AUTO);
  addEventListener('resize', () => app.resizeCanvas());

  const camera = new Entity('camera');
  camera.addComponent('camera', {
    clearColor: new Color(11 / 255, 11 / 255, 10 / 255),
    fov: bench.fov,
    nearClip: 0.05,
    farClip: 50,
  });
  app.root.addChild(camera);

  const asset = new Asset('scene', 'gsplat', { url: bench.scene.url });
  asset.once('load', () => {
    const splats = new Entity('splats');
    splats.addComponent('gsplat', { asset });
    app.root.addChild(splats);
    bench.loaded();
  });
  asset.once('error', (error: unknown) => bench.fail(String(error)));
  app.assets.add(asset);
  app.assets.load(asset);

  app.on('update', () => {
    const { position, target } = bench.pose();
    camera.setPosition(...position);
    camera.lookAt(...target);
  });
  app.on('frameend', () => bench.frame());
  app.start();
}

start().catch((error) => bench.fail(String(error)));
