/**
 * WGSL renderer.
 */
class WgslQuadRenderer {
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
   * Create WebGPU context from specified canvas.
   * @param {HTMLCanvasElement} canvas Render target canvas.
   */
  constructor(canvas, device, presentationFormat) {
    this.webgpu = canvas.getContext('webgpu');
    if (this.webgpu === null) {
      throw new Error('WebGPU is not supported: Failed to get webgpu context.');
    }
    this.webgpu.configure({
      device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });
    this.device = device;
    this.presentationFormat = presentationFormat;

    const verticesBuffer = device.createBuffer({
      size: WgslQuadRenderer.#vertices.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(verticesBuffer.getMappedRange()).set(WgslQuadRenderer.#vertices);
    verticesBuffer.unmap();
    this.verticesBuffer = verticesBuffer;

    const indicesBuffer = device.createBuffer({
      size: WgslQuadRenderer.#triangles.byteLength,
      usage: GPUBufferUsage.INDEX,
      mappedAtCreation: true
    });
    new Uint16Array(indicesBuffer.getMappedRange()).set(WgslQuadRenderer.#triangles);
    indicesBuffer.unmap();
    this.indicesBuffer = indicesBuffer;

    const uniformBuffer = device.createBuffer({
      size: 6 * Float32Array.BYTES_PER_ELEMENT,  // 24 is minumum binding size.
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.uniformBuffer = uniformBuffer;

    this.uniformDataArray = new Float32Array(6);
  }

  /**
   * Build shader program.
   * @param {string} fsText Fragment shader source code.
   * @param {string} vsText Vertex shader source code (optional).
   */
  build(fsText, vsText) {
    if (typeof vsText === 'undefined') {
      vsText = WgslQuadRenderer.vsDefaultText;
    }

    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({
          code: vsText
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
        module: this.device.createShaderModule({
          code: fsText
        }),
        entryPoint: 'main',
        targets: [
          {
            format: this.presentationFormat
          }
        ]
      },
      primitive: {
        topology: 'triangle-list'
      }
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0, // @binding(0) in shader
          resource: {
            buffer: this.uniformBuffer
          }
        }
      ]
    });
  }

  /**
   * Set uniform variables.
   * @param {number} time Elapsed time.
   * @param {number} mx Mouse move offset of X.
   * @param {number} my Mouse move offset of Y.
   * @param {number} width Width of viewport.
   * @param {number} height Height of viewport.
   */
  setUniforms(time, mx, my, width, height) {
    this.uniformDataArray[0] = time;
    this.uniformDataArray[1] = 0.0;  // Padding of struct.
    this.uniformDataArray[2] = mx;
    this.uniformDataArray[3] = my;
    this.uniformDataArray[4] = width;
    this.uniformDataArray[5] = height;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformDataArray);
  }

  /**
   * Render one frame.
   * @param {number} width Width of viewport.
   * @param {number} height Height of viewport.
   */
  render(width, height) {
    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.webgpu.getCurrentTexture().createView();
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
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.setVertexBuffer(0, this.verticesBuffer);
    passEncoder.setIndexBuffer(this.indicesBuffer, 'uint16');
    passEncoder.drawIndexed(WgslQuadRenderer.#triangles.length);
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
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
  @builtin(position) Position : vec4<f32>,
  @location(0) fragCoord : vec2<f32>
}

struct Uniforms {
  time : f32,
  mouse : vec2<f32>,
  resolution : vec2<f32>
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;

@vertex
fn main(
  @location(0) position: vec4<f32>
) -> VertexOutput {
  var output : VertexOutput;
  output.Position = position;
  output.fragCoord = (position.xy * vec2<f32>(0.5, 0.5) + vec2<f32>(0.5, 0.5)) * uniforms.resolution.xy;

  return output;
}
`;
  }
}
