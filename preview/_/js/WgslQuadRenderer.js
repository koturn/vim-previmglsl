;(function(moduleDef) {
  'use strict';

  // https://github.com/kriskowal/q

  // This file will function properly as a <script> tag,
  // or a module using CommonJS and NodeJS or RequireJS module formats.
  // In Common/Node/RequireJS, the module exports the WgslQuadRenderer API
  // and when executed as a simple <script>, it creates a WgslQuadRenderer global instead.

  if (typeof bootstrap === 'function') {
    // Montage Require
    bootstrap('promise', moduleDef);
  } else if (typeof exports === 'object' && typeof module === 'object') {
    // NodeJS or CommonJS
    module.exports = moduleDef();
  } else if (typeof define === 'function' && define.amd) {
    // RequireJS
    define(moduleDef);
  } else if (typeof ses !== 'undefined') {
    // SES (Secure EcmaScript)
    if (!ses.ok()) {
      return;
    } else {
      ses.makeWgslQuadRenderer = moduleDef;
    }
  } else {
    // <script>
    // Prefer window over self for add-on scripts.
    // Use self for non-windowed contexts.
    let global = typeof window !== 'undefined' ? window
      : typeof self !== 'undefined' ? self
      : null;
    if (global === null) {
      // SpiderMonkey or Rhino
      try {
        global = Function('return this')();
      } catch (Error) {
        throw new Error('This environment was not anticipated by hoge.js.');
      }
    }

    // Get the `window` object, save the previous WgslQuadRenderer global
    // and initialize WgslQuadRenderer as a global.
    const prevDefinition = global.WgslQuadRenderer;
    global.WgslQuadRenderer = moduleDef();

    // Add a noConflict function so WgslQuadRenderer can be removed from
    // the global namespace.
    global.WgslQuadRenderer.noConflict = function() {
      if (typeof prevDefinition === 'undefined') {
        delete global.WgslQuadRenderer;
      } else {
        global.WgslQuadRenderer = prevDefinition;
      }
      return this;
    };
  }
})(function() {
  'use strict';

  /**
   * WGSL renderer.
   */
  return class WgslQuadRenderer {
    /**
     * Vertex position data array.
     * @type {Float32Array}
     */
    static #vertices = new Float32Array([
      -1.0, 1.0, 0.0, 1.0,
      1.0, 1.0, 0.0, 1.0,
      -1.0, -1.0, 0.0, 1.0,
      1.0, -1.0, 0.0, 1.0
    ]);
    /**
     * Triangle index data array.
     * @type {Uint16Array}
     */
    static #triangles = new Uint16Array([
      0, 2, 1,
      1, 2, 3
    ]);

    /**
     * WebGPU context of canvas.
     * @type {GPUCanvsContext}
     */
    #webgpu;
    /**
     * GPU device.
     * @type {GPUDevice}
     */
    #device;
    /**
     * Presentation format string.
     * @type {string}
     */
    #presentationFormat;
    /**
     * GPU render pipeline.
     * @type {GPURenderPipeline}
     */
    #pipeline;
    /**
     * GPUBuffer for vertex positions.
     * @type {GPUBuffer}
     */
    #verticesBuffer;
    /**
     * GPUBuffer for vertex indices.
     * @type {GPUBuffer}
     */
    #indicesBuffer;
    /**
     * GPUBuffer for uniform variables.
     * @type {GPUBuffer}
     */
    #uniformBuffer;
    /**
     * Bind group.
     * @type {GPUBindGroup}
     */
    #bindGroup;
    /**
     * Data array of uniform variables.
     * @type {Float32Array}
     */
    #uniformDataArray;
    /**
     * Vertex shader that succeeded to compile.
     * @type {String}
     */
    #vsSource = null;
    /**
     * Fragment shader that succeeded to compile.
     * @type {String}
     */
    #fsSource = null;
    /**
     * A flag whether shader has been already built or not.
     * @type {boolean}
     */
    #hasBuilt;

    /**
     * Create WebGPU context from specified canvas.
     * @param {HTMLCanvasElement} canvas Render target canvas.
     */
    constructor(canvas, device, presentationFormat) {
      this.#webgpu = canvas.getContext('webgpu');
      if (this.#webgpu === null) {
        throw new Error('WebGPU is not supported: Failed to get webgpu context.');
      }
      this.#webgpu.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
      });
      this.#device = device;
      this.#presentationFormat = presentationFormat;

      const verticesBuffer = device.createBuffer({
        size: WgslQuadRenderer.#vertices.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });
      new Float32Array(verticesBuffer.getMappedRange()).set(WgslQuadRenderer.#vertices);
      verticesBuffer.unmap();
      this.#verticesBuffer = verticesBuffer;

      const indicesBuffer = device.createBuffer({
        size: WgslQuadRenderer.#triangles.byteLength,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true
      });
      new Uint16Array(indicesBuffer.getMappedRange()).set(WgslQuadRenderer.#triangles);
      indicesBuffer.unmap();
      this.#indicesBuffer = indicesBuffer;

      const uniformBuffer = device.createBuffer({
        // size: 6 * Float32Array.BYTES_PER_ELEMENT,
        size: 8 * Float32Array.BYTES_PER_ELEMENT,  // 32 is minimum binding size.
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.#uniformBuffer = uniformBuffer;

      this.#uniformDataArray = new Float32Array(6);

      this.#hasBuilt = false;
    }

    /**
     * Build shader program.
     * @param {string} fsSource Fragment shader source code.
     * @param {string} vsSource Vertex shader source code (optional).
     */
    build(fsSource, vsSource) {
      if (!vsSource) {
        vsSource = WgslQuadRenderer.vsDefaultText;
      }

      this.#hasBuilt = false;

      this.#pipeline = this.#device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: this.#device.createShaderModule({
            code: vsSource
          }),
          entryPoint: 'main',
          buffers: [
            {
              arrayStride: 4 * 4,
              attributes: [
                {
                  shaderLocation: 0,
                  offset: 0,
                  format: 'float32x4'
                }
              ]
            }
          ]
        },
        fragment: {
          module: this.#device.createShaderModule({
            code: fsSource
          }),
          entryPoint: 'main',
          targets: [
            {
              format: this.#presentationFormat
            }
          ]
        },
        primitive: {
          topology: 'triangle-list'
        }
      });

      this.#bindGroup = this.#device.createBindGroup({
        layout: this.#pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0, // @binding(0) in shader
            resource: {
              buffer: this.#uniformBuffer
            }
          }
        ]
      });

      this.#vsSource = vsSource;
      this.#fsSource = fsSource;

      this.#hasBuilt = true;
    }

    /**
     * Set uniform variables.
     * @param {number} time Elapsed time.
     * @param {number} mx Mouse move offset of X.
     * @param {number} my Mouse move offset of Y.
     * @param {number} width Width of viewport.
     * @param {number} height Height of viewport.
     * @param {number} frameCount Frame count.
     */
    setUniforms(time, mx, my, width, height, frameCount) {
      this.#uniformDataArray[0] = width;
      this.#uniformDataArray[1] = height;
      this.#uniformDataArray[2] = mx;
      this.#uniformDataArray[3] = my;
      this.#uniformDataArray[4] = time;
      this.#uniformDataArray[5] = frameCount;
      this.#device.queue.writeBuffer(this.#uniformBuffer, 0, this.#uniformDataArray);
    }

    /**
     * Render one frame.
     * @param {number} width Width of viewport.
     * @param {number} height Height of viewport.
     */
    render(width, height) {
      const commandEncoder = this.#device.createCommandEncoder();
      const textureView = this.#webgpu.getCurrentTexture().createView();
      const renderPassDescriptor = {
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      };

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setViewport(0.0, 0.0, width, height, 0.0, 1.0);
      passEncoder.setPipeline(this.#pipeline);
      passEncoder.setBindGroup(0, this.#bindGroup);
      passEncoder.setVertexBuffer(0, this.#verticesBuffer);
      passEncoder.setIndexBuffer(this.#indicesBuffer, 'uint16');
      passEncoder.drawIndexed(WgslQuadRenderer.#triangles.length);
      passEncoder.end();

      this.#device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Enable measuring frametime (not supported).
     * @param {number} size Window size of moving average for frametime.
     * @return {boolean} True if frametime measurement is available, otherwise false.
     */
    enableMeasureFrametime(size) {
      return false;
    }

    /**
     * Disable measuring frametime (not supported).
     */
    disableMeasureFrametime() {
      // Do nothing
    }

    /**
     * Get a flag whether shader has been already built or not.
     * @return {boolean} True if shader has been already built, otherwise false.
     */
    get hasBuilt() {
      return this.#hasBuilt;
    }

    /**
     * Get smoothed frametime (not supported).
     * @return {number} Frametime in nanoseconds.
     */
    get frametime() {
      return -1;
    }

    /**
     * Vertex shader source code.
     * @type {string}
     */
    get vertexShaderSource() {
      return this.#vsSource;
    }

    /**
     * Get translated vertex shader source. (not supported)
     * @return {string} Always null.
     */
    get translatedVertexShaderSource() {
      return null;
    }

    /**
     * Fragment shader source code for GLSL ES 1.0.
     * @type {string}
     */
    get fragmentShaderSource() {
      return this.#fsSource;
    }

    /**
     * Get translated fragment shader source. (not supported)
     * @return {string} Always null.
     */
    get translatedFragmentShaderSource() {
      return null;
    }

    /**
     * Create instance of this class.
     * @param {HTMLCanvasElement} canvas Render target canvas.
     * @return {WgslQuadRenderer} Instance of this class.
     */
    static async create(canvas) {
      const adapter = await navigator.gpu.requestAdapter();
      const device = await adapter.requestDevice();
      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
      return new WgslQuadRenderer(canvas, device, presentationFormat);
    }

    /**
     * Default vertex shader source code.
     * @type {string}
     */
    static get vsDefaultText() {
      return `struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) fragCoord : vec2<f32>
}

struct Uniforms {
  resolution: vec2f,
  mouse: vec2f,
  time: f32,
  frameCount: f32
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;

@vertex
fn main(
  @location(0) position: vec4f
) -> VertexOutput {
  var output: VertexOutput;
  output.position = position;
  output.fragCoord = (position.xy * vec2<f32>(0.5, 0.5) + vec2<f32>(0.5, 0.5)) * uniforms.resolution.xy;

  return output;
}
`;
    }

    /**
     * noConflict() for non global.
     */
    static noConflict() {
      throw new Error('WgslQuadRenderer.noConflict only works when WgslQuadRenderer is used as a global');
    }
  }
});
