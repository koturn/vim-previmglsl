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
    const gl = canvas.getContext('webgl2')
      || canvas.getContext('webgl')
      || canvas.getContext('experimental-webgl');
    if (gl === null) {
      throw new Error('WebGL 2.0 or WebGL is not supported.');
    }
    this.#gl = gl;
    this.uniformLocations = new Array(3);
  }

  /**
   * Build shader program.
   * @param {string} fsText Fragment shader source code.
   * @param {string} vsText Vertex shader source code (optional).
   */
  build(fsText, vsText) {
    if (typeof vsText === 'undefined') {
      vsText = fsText.match(/^\s*#\s*version\s+300\s+es/) === null ? GlslQuadRenderer.vsText100es : GlslQuadRenderer.vsText300es
    }

    const gl = this.#gl;

    const program = this.#createProgram(
      this.#createShaderFromText(vsText, gl.VERTEX_SHADER),
      this.#createShaderFromText(fsText, gl.FRAGMENT_SHADER));

    this.uniformLocations[0] = gl.getUniformLocation(program, 'u_time');
    this.uniformLocations[1] = gl.getUniformLocation(program, 'u_mouse');
    this.uniformLocations[2] = gl.getUniformLocation(program, 'u_resolution');

    const attribLocation = gl.getAttribLocation(program, 'position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#createVbo(GlslQuadRenderer.#vertices));
    gl.enableVertexAttribArray(attribLocation);
    gl.vertexAttribPointer(attribLocation, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#createIbo(GlslQuadRenderer.#triangles));

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
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
    const gl = this.#gl;
    gl.uniform1f(this.#uniformLocations[0], time);
    gl.uniform2fv(this.#uniformLocations[1], [mx, my]);
    gl.uniform2fv(this.#uniformLocations[2], [width, height]);
  }

  render(width, height) {
    const gl = this.#gl;
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.flush();
  }

  /**
   * Compile shader source code.
   * @param {string} text Shader souce code.
   * @param {number} shaderType Shader type constant.
   * @return {WebGLShader} Created shader.
   */
  #createShaderFromText(text, shaderType) {
    const gl = this.#gl;
    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, text);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
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
    const gl = this.#gl;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }

    gl.useProgram(program);
    return program;
  }

  /**
   * Create VBO (Vertex Buffer Object).
   * @param {Float32Array} Vertex position data array.
   * @return {WebGLBuffer} Created VBO.
   */
  #createVbo(vertices) {
    const gl = this.#gl;
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vbo;
  }

  /**
   * Create IBO (Index Buffer Object).
   * @param {Int16Array} Triangle index data array.
   * @return {WebGLBuffer} Created IBO.
   */
  #createIbo(triangles) {
    const gl = this.#gl;
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triangles, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return ibo;
  }

  /**
   * Vertex shader source code for GLSL ES 1.0.
   * @type {string}
   */
  static get vsText100es() {
    return "attribute vec3 position;\nvoid main(void)\n{\n  gl_Position = vec4(position, 1.0);\n}\n";
  }

  /**
   * Vertex shader source code for GLSL ES 3.0.
   * @type {string}
   */
  static get vsText300es() {
    return "#version 300 es\nin vec3 position;\nvoid main(void)\n{\n  gl_Position = vec4(position, 1.0);\n}\n";
  }
}
