import type { spine as Spine } from '@/lib/vendor/spine-3.8/spine-webgl';
import type { ChibiModel } from '@/lib/operators/chibi';
import { chibiAtlas } from '@/lib/operators/chibiAtlas';
import { chibiIdleAnimation } from '@/lib/operators/chibiRoutine';
import { chibiClip, chibiPlacement, finiteBounds } from '@/lib/operators/chibiFraming';
import type { ChibiBounds } from '@/lib/operators/chibiFraming';
import { premultipliedTexture } from '@/lib/spine/premultipliedTexture';
import { frameDue } from '@/lib/operators/desktopMotion';
import { assetUrl } from '@/lib/operators/library';

type Runtime = typeof Spine;
type Context = InstanceType<Runtime['webgl']['ManagedWebGLRenderingContext']>;

export interface ChibiControl { moving: boolean; flipped: boolean; reaction: string; sequence: number; pose?: string; poseLoop?: boolean }
export interface ChibiActorHooks {
  /** The chibi's hit box; the artwork is centred on it. */
  node: () => HTMLElement | null;
  control: () => ChibiControl;
  ready: (names: string[], durations: Record<string, number>) => void;
  failed: () => void;
  /** A one-shot reaction finished. */
  complete: () => void;
}
interface Shared { data: Spine.SkeletonData; stateData: Spine.AnimationStateData; atlas: Spine.TextureAtlas; idle: string; walk?: string; bounds: ChibiBounds }
interface Entry { users: number; loading: Promise<Shared>; shared?: Shared; disposed: boolean }
interface Actor { hooks: ChibiActorHooks; skeleton?: Spine.Skeleton; state?: Spine.AnimationState; shared?: Shared; clip: string; sequence: number; loop: boolean }

/**
 * Every desktop chibi is drawn by ONE WebGL context on ONE full-window canvas. Browsers and
 * Electron keep only about 16 live WebGL contexts per process and silently drop the oldest, which
 * is what breaks the website's one-canvas-per-chibi design above 15 chibis.
 */
export class ChibiStage {
  private runtime?: Runtime;
  private context?: Context;
  private renderer?: Spine.webgl.SceneRenderer;
  private readonly actors = new Set<Actor>();
  private readonly models = new Map<string, Entry>();
  private frame = 0;
  private previous = performance.now();
  private fps = 60;
  private blank = false;
  private stopped = false;
  private readonly started: Promise<void>;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.started = (async () => {
      const { spine } = await import('@/lib/vendor/spine-3.8/spine-webgl');
      if (this.stopped) return;
      this.runtime = spine;
      // Pages are uploaded premultiplied (premultipliedTexture), so the canvas composites premultiplied too.
      this.context = new spine.webgl.ManagedWebGLRenderingContext(canvas, { alpha: true, antialias: true, premultipliedAlpha: true });
      this.renderer = new spine.webgl.SceneRenderer(canvas, this.context, true);
      this.frame = requestAnimationFrame(this.render);
    })();
  }

  /** Registers a chibi; returns its removal function. */
  setFrameRate(fps:number) { this.fps = [15,30,60].includes(fps) ? fps : 60; }

  add(model: ChibiModel, hooks: ChibiActorHooks): () => void {
    const actor: Actor = { hooks, clip: '', sequence: -1, loop: true };
    const key = `${model.skeleton}\n${model.atlas}`;
    let removed = false;
    this.actors.add(actor);
    this.acquire(key, model).then(shared => {
      if (removed || this.stopped || !this.runtime) return;
      const spine = this.runtime;
      actor.shared = shared;
      actor.skeleton = new spine.Skeleton(shared.data);
      actor.skeleton.setToSetupPose();
      actor.state = new spine.AnimationState(shared.stateData);
      const state = actor.state;
      state.addListener({ start: () => {}, interrupt: () => {}, end: () => {}, dispose: () => {}, event: () => {}, complete: entry => { if (entry === state.getCurrent(0) && !entry.loop) actor.hooks.complete(); } });
      hooks.ready(shared.data.animations.map(value => value.name), Object.fromEntries(shared.data.animations.map(value => [value.name, value.duration])));
    }, () => { if (!removed) hooks.failed(); });
    return () => {
      if (removed) return;
      removed = true;
      this.actors.delete(actor);
      this.release(key);
    };
  }

  dispose() {
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    this.actors.clear();
    for (const entry of this.models.values()) { entry.disposed = true; entry.shared?.atlas.dispose(); }
    this.models.clear();
    this.renderer?.dispose();
    this.context?.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  /** Copies of the same chibi share one skeleton, atlas and set of textures. */
  private acquire(key: string, model: ChibiModel): Promise<Shared> {
    let entry = this.models.get(key);
    if (!entry) {
      const created: Entry = { users: 0, disposed: false, loading: Promise.resolve() as unknown as Promise<Shared> };
      created.loading = this.load(model).then(shared => {
        if (created.disposed) { shared.atlas.dispose(); throw Error('Released'); }
        created.shared = shared;
        return shared;
      }, error => { if (this.models.get(key) === created) this.models.delete(key); throw error; });
      this.models.set(key, created);
      entry = created;
    }
    entry.users++;
    return entry.loading;
  }

  private release(key: string) {
    const entry = this.models.get(key);
    if (!entry || --entry.users > 0) return;
    this.models.delete(key);
    entry.disposed = true;
    entry.shared?.atlas.dispose();
  }

  private async load(model: ChibiModel): Promise<Shared> {
    const [skeletonBytes, atlasText, images] = await Promise.all([
      fetch(assetUrl(model.skeleton)).then(res => { if (!res.ok) throw Error('Skeleton unavailable'); return res.arrayBuffer(); }),
      fetch(assetUrl(model.atlas)).then(res => { if (!res.ok) throw Error('Atlas unavailable'); return res.text(); }),
      Promise.all(Object.entries(model.textures).map(([name, url]) => new Promise<[string, HTMLImageElement]>((resolve, reject) => {
        const image = new Image(); image.crossOrigin = 'anonymous';
        image.onload = () => resolve([name, image]); image.onerror = () => reject(Error('Texture unavailable')); image.src = assetUrl(url);
      }))),
      this.started,
    ]);
    const spine = this.runtime, context = this.context;
    if (!spine || !context) throw Error('Stage stopped');
    const textures = new Map(images);
    const atlas = chibiAtlas(spine, atlasText, name => {
      const image = textures.get(name); if (!image) throw Error(`Missing texture ${name}`);
      return premultipliedTexture(spine, context, image, model.premultipliedAlpha);
    });
    try {
      const bytes=new Uint8Array(skeletonBytes), text=new TextDecoder().decode(bytes.slice(0,64)).trimStart();
      const loader=new spine.AtlasAttachmentLoader(atlas);
      const data = text.startsWith('{') ? new spine.SkeletonJson(loader).readSkeletonData(JSON.parse(new TextDecoder().decode(bytes))) : new spine.SkeletonBinary(loader).readSkeletonData(bytes);
      const stateData = new spine.AnimationStateData(data); stateData.defaultMix = .15;
      const names = data.animations.map(value => value.name);
      const idle = chibiIdleAnimation(data.animations) ?? (names.includes('Idle') ? 'Idle' : names[0]);
      const walk = names.find(name => /^(move|walk)$/i.test(name)) ?? names.find(name => /walk|move/i.test(name));
      return { data, stateData, atlas, idle, walk, bounds: idleBounds(spine, data, stateData, idle) };
    } catch (error) { atlas.dispose(); throw error; }
  }

  private readonly render = (now: number) => {
    if (this.stopped) return;
    this.frame = requestAnimationFrame(this.render);
    if (!frameDue(now, this.previous, this.fps)) return;
    const renderer = this.renderer!, gl = this.context!.gl, canvas = this.canvas;
    const dt = Math.min(.1, (now - this.previous) / 1000); this.previous = now;
    const drawable = [...this.actors].filter(actor => actor.skeleton);
    // Nothing to draw: clear once, then leave the GPU idle.
    if (!drawable.length && this.blank) return;
    const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    this.blank = !drawable.length;
    if (this.blank) return;
    // One world unit is one CSS pixel; the origin is the window's bottom-left corner.
    renderer.camera.position.x = width / 2; renderer.camera.position.y = height / 2;
    renderer.camera.viewportWidth = width; renderer.camera.viewportHeight = height;
    renderer.begin();
    for (const actor of drawable) {
      const node = actor.hooks.node(), skeleton = actor.skeleton!, state = actor.state!, shared = actor.shared!;
      if (!node) continue;
      const control = actor.hooks.control();
      const { clip, loop } = chibiClip(shared.data.animations.map(value => value.name), shared.idle, shared.walk, control.moving, control.reaction, control.pose, control.poseLoop);
      if (clip !== actor.clip || loop !== actor.loop || (!loop && control.sequence !== actor.sequence)) {
        actor.clip = clip; actor.loop = loop; actor.sequence = control.sequence;
        state.setAnimation(0, clip, loop);
      }
      if (!document.hidden) state.update(dt);
      state.apply(skeleton);
      // Exposed for debugging and for tests that need to know what the shared stage chose.
      if (node.dataset.clip !== clip) node.dataset.clip = clip;
      if (node.dataset.pose !== (control.pose ?? '')) node.dataset.pose = control.pose ?? '';
      const rect = node.getBoundingClientRect();
      const place = chibiPlacement(shared.bounds, rect, height, control.flipped);
      // Native Sit lowers the hips below standing ground, and Sleep is authored above the
      // mattress; lift those poses onto the furniture, as the website does (0.25 / 0.13 of
      // the idle pose's height).
      const lift = control.pose ? (/^sit/i.test(control.pose) ? .25 : /^sleep/i.test(control.pose) ? .13 : 0) : 0;
      skeleton.x = place.x; skeleton.y = place.y + lift * shared.bounds.height * place.scaleY; skeleton.scaleX = place.scaleX; skeleton.scaleY = place.scaleY;
      skeleton.updateWorldTransform();
      renderer.drawSkeleton(skeleton, true);
    }
    renderer.end();
  };
}

/** The visible idle pose, measured once per model. Invisible effect slots can be much larger than
 * the character in the setup pose; including them makes bard chibis tiny. */
function idleBounds(spine: Runtime, data: Spine.SkeletonData, stateData: Spine.AnimationStateData, idle: string): ChibiBounds {
  const skeleton = new spine.Skeleton(data), state = new spine.AnimationState(stateData);
  skeleton.setToSetupPose();
  if (idle) state.setAnimation(0, idle, true);
  state.apply(skeleton); skeleton.updateWorldTransform();
  const order = skeleton.drawOrder;
  skeleton.drawOrder = order.filter(slot => slot.color.a >= .01);
  const origin = new spine.Vector2(), size = new spine.Vector2();
  skeleton.getBounds(origin, size, []);
  skeleton.drawOrder = order;
  return finiteBounds({ x: origin.x, y: origin.y, width: size.x, height: size.y });
}
