/**
 * GLSL renderer.
 */
class GlslQuadRenderer {
  /**
   * Vertex position data array.
   * @type {Float32Array}
   */
  static #vertices = new Float32Array([
    -1.0, 1.0, 0.0,
    1.0, 1.0, 0.0,
    -1.0, -1.0, 0.0,
    1.0, -1.0, 0.0
  ]);
  /**
   * Triangle index data array.
   * @type {Int16Array}
   */
  static #triangles = new Int16Array([
    0, 2, 1,
    1, 2, 3
  ]);
  /**
   * WebGL context of canvas.
   * @type {WebGLRenderingContext}
   */
  #gl;
  /**
   * Uniform variable locations.
   * @type {Array}
   */
  #uniformLocations;

  /**
   * Create WebGL/WebGL2 context from specified canvas.
   * @param {HTMLCanvasElement} canvas Render target canvas.
   */
  constructor(canvas) {
    this.gl = canvas.getContext('webgl2')
      || canvas.getContext('experimental-webgl2')
      || canvas.getContext('webgl')
      || canvas.getContext('experimental-webgl');
    if (this.gl === null) {
      throw new Error('WebGL 2.0 or WebGL is not supported.');
    }
    this.uniformLocations = new Array();
  }

  /**
   * Build shader program.
   * @param {string} fsText Fragment shader source code.
   * @param {string} vsText Vertex shader source code (optional).
   */
  build(fsText, vsText) {
    if (typeof vsText === 'undefined') {
      vsText = fsText.match(/^\s*#\s*version\s*300\s+es/) === null ? GlslQuadRenderer.vsText100es : GlslQuadRenderer.vsText300es
    }

    const program = this.#createProgram(
      this.#createShaderFromText(vsText, this.gl.VERTEX_SHADER),
      this.#createShaderFromText(fsText, this.gl.FRAGMENT_SHADER));

    this.uniformLocations[0] = this.gl.getUniformLocation(program, 'u_time');
    this.uniformLocations[1] = this.gl.getUniformLocation(program, 'u_mouse');
    this.uniformLocations[2] = this.gl.getUniformLocation(program, 'u_resolution');

    const attribLocation = this.gl.getAttribLocation(program, 'position');
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.#createVbo(GlslQuadRenderer.#vertices));
    this.gl.enableVertexAttribArray(attribLocation);
    this.gl.vertexAttribPointer(attribLocation, 3, this.gl.FLOAT, false, 0, 0);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.#createIbo(GlslQuadRenderer.#triangles));

    this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
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
    this.gl.uniform1f(this.uniformLocations[0], time);
    this.gl.uniform2fv(this.uniformLocations[1], [mx, my]);
    this.gl.uniform2fv(this.uniformLocations[2], [width, height]);
  }

  render(width, height) {
    this.gl.viewport(0, 0, width, height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
    this.gl.flush();
  }

  /**
   * Compile shader source code.
   * @param {string} text Shader souce code.
   * @param {number} shaderType Shader type constant.
   * @return {WebGLShader} Created shader.
   */
  #createShaderFromText(text, shaderType) {
    const shader = this.gl.createShader(shaderType);
    this.gl.shaderSource(shader, text);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader));
    }

    return shader;
  }

  /**
   * Create and link program.
   * @param {WebGLShader,WebGL2Shader} vs Vertex shader.
   * @param {WebGLShader,WebGL2Shader} fs Fragment shader.
   * @return {WebGLProgram,WebGL2Program} Created shader.
   */
  #createProgram(vs, fs) {
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(this.gl.getProgramInfoLog(program));
    }

    this.gl.useProgram(program);
    return program;
  }

  /**
   * Create VBO (Vertex Buffer Object).
   * @param {Float32Array} Vertex position data array.
   * @return {WebGLBuffer} Created VBO.
   */
  #createVbo(vertices) {
    const vbo = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    return vbo;
  }

  /**
   * Create IBO (Index Buffer Object).
   * @param {Int16Array} Triangle index data array.
   * @return {WebGLBuffer} Created IBO.
   */
  #createIbo(triangles) {
    const ibo = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, ibo);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, triangles, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
    return ibo;
  }

  /**
   * Vertex shader source code for GLSL ES 1.0.
   * @type {string}
   */
  static get vsText100es() {
    return "attribute vec3 position;\nvoid main(void)\n{\n  gl_Position = vec4(position, 1.0);\n}";
  }

  /**
   * Vertex shader source code for GLSL ES 3.0.
   * @type {string}
   */
  static get vsText300es() {
    return "#version 300 es\nin vec3 position;\nvoid main(void)\n{\n  gl_Position = vec4(position, 1.0);\n}";
  }
}
