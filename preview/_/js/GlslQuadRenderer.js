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
   * Cached compiled default GLSL ES 1.0 vertex shader.
   * @type {WebGLShader}
   */
  #defaultVs100es = null;
  /**
   * Cached compiled default GLSL ES 3.0 vertex shader.
   * @type {WebGLShader}
   */
  #defaultVs300es = null;
  /**
   * WebGL extension of EXT_disjoint_timer_query or EXT_disjoint_timer_query_webgl2.
   * @type {Object}
   */
  #extDisjointTimerQuery;
  /**
   * Begin measuring frametime.
   * @type {function(): object}
   */
  #beginMeasurement;
  /**
   * End measuring frametime.
   * @type {function(Object)}
   */
  #endMeasurement;
  /**
   * Update sum of frametime for moving average.
   * @type {function()}
   */
  #updateFrametime;
  /**
   * Retrieve moving average value of frametime.
   * @type {function(): number}
   */
  #retrieveFrametime;

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
    this.#uniformLocations = new Array(3);

    this.#extDisjointTimerQuery = gl.getExtension('EXT_disjoint_timer_query_webgl2')
      || gl.getExtension('EXT_disjoint_timer_query');
    this.disableMeasureFrametime();
  }

  /**
   * Build shader program.
   * @param {string} fsText Fragment shader source code.
   * @param {string} vsText Vertex shader source code (optional).
   */
  build(fsText, vsText) {
    const gl = this.#gl;

    const vs = typeof vsText !== 'undefined' ? this.#createShaderFromText(vsText, gl.VERTEX_SHADER)
      : fsText.match(/^\s*#\s*version\s+300\s+es/) === null ? this.#getVertexShader100es()
      : this.#getVertexShader300es();
    const fs = this.#createShaderFromText(fsText, gl.FRAGMENT_SHADER);

    const program = this.#createProgram(vs, fs);

    this.#uniformLocations[0] = gl.getUniformLocation(program, 'u_time');
    this.#uniformLocations[1] = gl.getUniformLocation(program, 'u_mouse');
    this.#uniformLocations[2] = gl.getUniformLocation(program, 'u_resolution');

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
    gl.uniform2f(this.#uniformLocations[1], mx, my);
    gl.uniform2f(this.#uniformLocations[2], width, height);
  }

  /**
   * Render one frame.
   * @param {number} width Width of viewport.
   * @param {number} height Height of viewport.
   */
  render(width, height) {
    const gl = this.#gl;

    const query = this.#beginMeasurement();

    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.flush();

    this.#endMeasurement(query);
    this.#updateFrametime();
  }

  /**
   * Enable measuring frametime.
   * @param {number} size Window size of moving average for frametime.
   * @return {boolean} True if frametime measurement is available, otherwise false.
   */
  enableMeasureFrametime(size) {
    if (this.#extDisjointTimerQuery === null) {
      return false;
    }

    const usingList = [];
    const availableList = [];

    size = typeof size !== 'undefined' ? size : 60;
    let count = 0;
    let index = 0;
    let sum = 0;
    const dataArray = new Float64Array(size);
    const append = value => {
      index++;
      if (count < dataArray.length) {
        dataArray[index] = value;
        sum += value;
        count++;
      } else {
        if (index >= dataArray.length) {
          index -= dataArray.length;
        }
        const oldValue = dataArray[index];
        dataArray[index] = value;
        sum += value - oldValue;
      }
    };

    this.#retrieveFrametime = () => count === 0 ? 0 : sum / count;

    if (this.#extDisjointTimerQuery.toString() === '[object EXTDisjointTimerQueryWebGL2]') {
      this.#beginMeasurement = () => {
        const availableQuery = availableList.length ? availableList.shift() : this.#gl.createQuery();
        this.#gl.beginQuery(this.#extDisjointTimerQuery.TIME_ELAPSED_EXT, availableQuery);
        return availableQuery;
      };

      this.#endMeasurement = query => {
        this.#gl.endQuery(this.#extDisjointTimerQuery.TIME_ELAPSED_EXT, query);
        usingList.push(query);
      };

      this.#updateFrametime = () => {
        const gl = this.#gl;

        if (gl.getParameter(this.#extDisjointTimerQuery.GPU_DISJOINT_EXT)) {
          usingList.forEach(query => gl.deleteQuery(query));
          return;
        }

        for (let usingQuery = usingList[0]; typeof usingQuery !== 'undefined'; usingQuery = usingList[0]) {
          if (!gl.getQueryParameter(usingQuery, gl.QUERY_RESULT_AVAILABLE)) {
            break;
          }

          const result = gl.getQueryParameter(usingQuery, gl.QUERY_RESULT);
          availableList.push(usingList.shift());
          append(result);

          usingList.shift();
        }
      };
    } else {
      this.#beginMeasurement = () => {
        const ext = this.#extDisjointTimerQuery;
        const availableQuery = availableList.length ? availableList.shift() : ext.createQueryEXT();
        ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, availableQuery);
        return availableQuery;
      };

      this.#endMeasurement = query => {
        if (query === null) {
          return;
        }
        const ext = this.#extDisjointTimerQuery;
        ext.endQueryEXT(ext.TIME_ELAPSED_EXT, query);
        usingList.push(query);
      };

      this.#updateFrametime = () => {
        const ext = this.#extDisjointTimerQuery;

        if (this.#gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          usingList.forEach(query => ext.deleteQueryEXT(query));
          return;
        }

        for (let usingQuery = usingList[0]; typeof usingQuery !== 'undefined'; usingQuery = usingList[0]) {
          if (!ext.getQueryObjectEXT(usingQuery, ext.QUERY_RESULT_AVAILABLE_EXT)) {
            break;
          }

          const result = ext.getQueryObjectEXT(usingQuery, ext.QUERY_RESULT_EXT);
          availableList.push(usingList.shift());
          append(result);

          usingList.shift();
        }
      };
    }

    return true;
  }

  /**
   * Disable measuring frametime.
   */
  disableMeasureFrametime() {
    this.#beginMeasurement = () => null;
    this.#endMeasurement = query => {};
    this.#updateFrametime = () => {};
    this.#retrieveFrametime = () => -1;
  }

  /**
   * Get smoothed frametime.
   * @return {number} Frametime in nanoseconds.
   */
  getFrameTime() {
    return this.#retrieveFrametime();
  }

  /**
   * Get default GLSL ES 1.0 vertex shader.
   * @return {WebGLShader} Created vertex shader.
   */
  #getVertexShader100es() {
    if (this.#defaultVs100es === null) {
      this.#defaultVs100es = this.#createShaderFromText(GlslQuadRenderer.vsText100es, this.#gl.VERTEX_SHADER);
    }
    return this.#defaultVs100es;
  }

  /**
   * Get default GLSL ES 3.0 vertex shader.
   * @return {WebGLShader} Created vertex shader.
   */
  #getVertexShader300es() {
    if (this.#defaultVs300es === null) {
      this.#defaultVs300es = this.#createShaderFromText(GlslQuadRenderer.vsText300es, this.#gl.VERTEX_SHADER);
    }
    return this.#defaultVs300es;
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
