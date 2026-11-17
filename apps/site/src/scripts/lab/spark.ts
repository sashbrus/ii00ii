// Bake-off candidate A: three.js with the Spark splat renderer (WebGL2).
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { Bench } from './bench.ts';

const bench = new Bench('spark');
bench.setBackend('webgl2');

const renderer = new WebGLRenderer({
  canvas: bench.canvas,
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(bench.pixelRatio);

const scene = new Scene();
scene.background = new Color(0x0b0b0a);
const camera = new PerspectiveCamera(bench.fov, 1, 0.05, 50);

const resize = (): void => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
resize();
addEventListener('resize', resize);

scene.add(new SparkRenderer({ renderer }));
const splats = new SplatMesh({ url: bench.scene.url });
scene.add(splats);
splats.initialized.then(
  () => bench.loaded(),
  (error) => bench.fail(String(error)),
);

renderer.setAnimationLoop(() => {
  const { position, target } = bench.pose();
  camera.position.set(...position);
  camera.lookAt(...target);
  renderer.render(scene, camera);
  bench.frame();
});
